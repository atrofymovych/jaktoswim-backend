const router = require('express').Router();
const mongoose = require('mongoose');
const { createCacheMiddleware } = require('../../middlewares/cacheMiddleware');

const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_DOMAIN = process.env.DAILY_DOMAIN || 'crm-system.daily.co';

if (!DAILY_API_KEY) {
  console.error('❌ DAILY_API_KEY not found in environment variables');
}

// Cache middleware for room data
const roomCache = createCacheMiddleware({
  ttl: 300, // 5 minutes
  keyGenerator: (req) => `daily-room-${req.params.roomName || req.body.roomName}`,
});

// Helper function to make Daily.co API calls
async function callDailyAPI(endpoint, method = 'GET', body = null) {
  const url = `https://api.daily.co/v1${endpoint}`;

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Daily.co API error: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('Daily.co API Error:', error);
    throw error;
  }
}

// Helper function to generate room name
function generateRoomName(orgId, prefix = 'crm') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${orgId}-${timestamp}-${random}`;
}

// Helper function to create room URL
function createRoomUrl(roomName) {
  return `https://${DAILY_DOMAIN}/${roomName}`;
}

// ==================== ROOM MANAGEMENT ====================

/**
 * Create a new video call room
 * POST /daily/rooms
 */
router.post('/rooms', async (req, res) => {
  try {
    const {
      name,
      max_participants = 10,
      duration = 60,
      enable_recording = false,
      enable_chat = true,
      enable_screenshare = true,
      enable_prejoin_ui = false,
      participants = [],
      metadata = {},
    } = req.body;

    // Generate room name if not provided
    const roomName = name || generateRoomName(req.activeOrgId);

    // Create room configuration
    const roomConfig = {
      name: roomName,
      properties: {
        max_participants,
        enable_recording,
        enable_chat,
        enable_screenshare,
        enable_prejoin_ui,
        enable_network_ui: false,
        enable_knocking: false,
        start_video_off: false,
        start_audio_off: false,
        // Room expiration
        exp: Math.floor(Date.now() / 1000) + duration * 60,
        // No default theme - frontend controls all styling
      },
    };

    // Create room via Daily.co API
    const room = await callDailyAPI('/rooms', 'POST', roomConfig);

    // Prepare response
    const response = {
      room_id: room.name,
      room_url: createRoomUrl(room.name),
      room_name: room.name,
      max_participants: room.properties.max_participants,
      duration_minutes: duration,
      created_at: room.created_at,
      expires_at: new Date(Date.now() + duration * 60 * 1000).toISOString(),
      participants: participants,
      metadata: {
        ...metadata,
        org_id: req.activeOrgId,
        created_by: req.auth?.userId,
        source: 'crm-integration',
      },
      // Frontend integration helpers - minimal data only
      embed_config: {
        room_url: createRoomUrl(room.name),
        room_name: room.name,
        // Frontend controls all UI aspects
        frontend_controlled: true,
      },
    };

    // Track room creation
    try {
      const { trackVideoCallCreation } = require('../../prometheus');
      trackVideoCallCreation(req.activeOrgId, 'room_created');
    } catch (error) {
      console.error('Error tracking room creation:', error.message);
    }

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({
      error: 'failed_to_create_room',
      message: error.message,
    });
  }
});

/**
 * Get room details
 * GET /daily/rooms/:roomName
 */
router.get('/rooms/:roomName', roomCache, async (req, res) => {
  try {
    const { roomName } = req.params;

    const room = await callDailyAPI(`/rooms/${roomName}`);

    // Get current participants
    const participants = await callDailyAPI(`/rooms/${roomName}/participants`);

    const response = {
      room_id: room.name,
      room_url: createRoomUrl(room.name),
      room_name: room.name,
      max_participants: room.properties.max_participants,
      created_at: room.created_at,
      config: room.config,
      properties: room.properties,
      participants: participants.data || [],
      participant_count: participants.data?.length || 0,
      is_active: (participants.data?.length || 0) > 0,
      // Frontend helpers
      embed_config: {
        iframe_url: createRoomUrl(room.name),
        sdk_config: {
          showLeaveButton: true,
          showFullscreenButton: true,
          showLocalVideo: true,
          showParticipantsBar: true,
          theme: room.properties.theme,
        },
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting room:', error);
    res.status(500).json({
      error: 'failed_to_get_room',
      message: error.message,
    });
  }
});

/**
 * Update room settings
 * PUT /daily/rooms/:roomName
 */
router.put('/rooms/:roomName', async (req, res) => {
  try {
    const { roomName } = req.params;
    const { max_participants, enable_recording, enable_chat, enable_screenshare, duration } = req.body;

    const updateData = {};
    if (max_participants !== undefined) updateData.max_participants = max_participants;
    if (enable_recording !== undefined) updateData.enable_recording = enable_recording;
    if (enable_chat !== undefined) updateData.enable_chat = enable_chat;
    if (enable_screenshare !== undefined) updateData.enable_screenshare = enable_screenshare;
    if (duration !== undefined) {
      updateData.exp = Math.floor(Date.now() / 1000) + duration * 60;
    }

    const room = await callDailyAPI(`/rooms/${roomName}`, 'POST', {
      properties: updateData,
    });

    res.json({
      room_id: room.name,
      room_url: createRoomUrl(room.name),
      room_name: room.name,
      properties: room.properties,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error updating room:', error);
    res.status(500).json({
      error: 'failed_to_update_room',
      message: error.message,
    });
  }
});

/**
 * Delete room
 * DELETE /daily/rooms/:roomName
 */
router.delete('/rooms/:roomName', async (req, res) => {
  try {
    const { roomName } = req.params;

    await callDailyAPI(`/rooms/${roomName}`, 'DELETE');

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({
      error: 'failed_to_delete_room',
      message: error.message,
    });
  }
});

/**
 * List all rooms
 * GET /daily/rooms
 */
router.get('/rooms', async (req, res) => {
  try {
    const { limit = 50, ending_before, starting_after } = req.query;

    const params = new URLSearchParams();
    if (limit) params.append('limit', limit);
    if (ending_before) params.append('ending_before', ending_before);
    if (starting_after) params.append('starting_after', starting_after);

    const rooms = await callDailyAPI(`/rooms?${params.toString()}`);

    const response = {
      rooms: rooms.data.map((room) => ({
        room_id: room.name,
        room_url: createRoomUrl(room.name),
        room_name: room.name,
        max_participants: room.properties.max_participants,
        created_at: room.created_at,
        config: room.config,
        properties: room.properties,
      })),
      total: rooms.data.length,
      pagination: {
        has_more: rooms.has_more,
        ending_before: rooms.ending_before,
        starting_after: rooms.starting_after,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Error listing rooms:', error);
    res.status(500).json({
      error: 'failed_to_list_rooms',
      message: error.message,
    });
  }
});

// ==================== PARTICIPANT MANAGEMENT ====================

/**
 * Get room participants
 * GET /daily/rooms/:roomName/participants
 */
router.get('/rooms/:roomName/participants', async (req, res) => {
  try {
    const { roomName } = req.params;

    const participants = await callDailyAPI(`/rooms/${roomName}/participants`);

    const response = {
      room_name: roomName,
      participants: participants.data.map((p) => ({
        id: p.id,
        user_id: p.user_id,
        user_name: p.user_name,
        join_time: p.join_time,
        duration: p.duration,
        status: p.status,
        is_owner: p.is_owner,
        is_local: p.is_local,
        media: {
          audio: p.audio,
          video: p.video,
          screen: p.screen,
        },
      })),
      total: participants.data.length,
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting participants:', error);
    res.status(500).json({
      error: 'failed_to_get_participants',
      message: error.message,
    });
  }
});

/**
 * Remove participant from room
 * DELETE /daily/rooms/:roomName/participants/:participantId
 */
router.delete('/rooms/:roomName/participants/:participantId', async (req, res) => {
  try {
    const { roomName, participantId } = req.params;

    await callDailyAPI(`/rooms/${roomName}/participants/${participantId}`, 'DELETE');

    res.status(204).send();
  } catch (error) {
    console.error('Error removing participant:', error);
    res.status(500).json({
      error: 'failed_to_remove_participant',
      message: error.message,
    });
  }
});

// ==================== TOKEN MANAGEMENT ====================

/**
 * Create meeting token for participant
 * POST /daily/rooms/:roomName/token
 */
router.post('/rooms/:roomName/token', async (req, res) => {
  try {
    const { roomName } = req.params;
    const {
      user_id,
      user_name,
      is_owner = false,
      exp = 3600, // 1 hour default
      permissions = ['can_send', 'can_admin'],
    } = req.body;

    if (!user_id || !user_name) {
      return res.status(400).json({
        error: 'user_id_and_user_name_required',
      });
    }

    const tokenData = {
      properties: {
        room_name: roomName,
        user_id,
        user_name,
        is_owner,
        exp: Math.floor(Date.now() / 1000) + exp,
      },
    };

    const token = await callDailyAPI('/meeting-tokens', 'POST', tokenData);

    res.json({
      token: token.token,
      room_name: roomName,
      user_id,
      user_name,
      is_owner,
      expires_at: new Date(Date.now() + exp * 1000).toISOString(),
    });
  } catch (error) {
    console.error('Error creating token:', error);
    res.status(500).json({
      error: 'failed_to_create_token',
      message: error.message,
    });
  }
});

// ==================== RECORDING MANAGEMENT ====================

/**
 * Start room recording
 * POST /daily/rooms/:roomName/recording
 */
router.post('/rooms/:roomName/recording', async (req, res) => {
  try {
    const { roomName } = req.params;
    const { layout = 'default', output_format = 'mp4', resolution = '1080p' } = req.body;

    const recordingData = {
      layout,
      output_format,
      resolution,
    };

    const recording = await callDailyAPI(`/rooms/${roomName}/recordings`, 'POST', recordingData);

    res.json({
      recording_id: recording.id,
      room_name: roomName,
      status: recording.status,
      started_at: recording.started_at,
      layout,
      output_format,
      resolution,
    });
  } catch (error) {
    console.error('Error starting recording:', error);
    res.status(500).json({
      error: 'failed_to_start_recording',
      message: error.message,
    });
  }
});

/**
 * Stop room recording
 * DELETE /daily/rooms/:roomName/recording
 */
router.delete('/rooms/:roomName/recording', async (req, res) => {
  try {
    const { roomName } = req.params;

    await callDailyAPI(`/rooms/${roomName}/recordings`, 'DELETE');

    res.json({
      room_name: roomName,
      status: 'stopped',
      stopped_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error stopping recording:', error);
    res.status(500).json({
      error: 'failed_to_stop_recording',
      message: error.message,
    });
  }
});

// ==================== FRONTEND HELPERS ====================

/**
 * Get clean room data for frontend UI control
 * GET /daily/rooms/:roomName/clean
 */
router.get('/rooms/:roomName/clean', async (req, res) => {
  try {
    const { roomName } = req.params;

    const room = await callDailyAPI(`/rooms/${roomName}`);
    const participants = await callDailyAPI(`/rooms/${roomName}/participants`);

    // Return only essential data - no UI assumptions
    const response = {
      room_id: room.name,
      room_url: createRoomUrl(room.name),
      room_name: room.name,
      max_participants: room.properties.max_participants,
      created_at: room.created_at,
      config: room.config,
      properties: room.properties,
      participants: participants.data || [],
      participant_count: participants.data?.length || 0,
      is_active: (participants.data?.length || 0) > 0,
      // Frontend controls all UI aspects
      frontend_controlled: true,
      // Raw Daily.co data for advanced usage
      daily_co_data: {
        room: room,
        participants: participants.data || [],
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting clean room data:', error);
    res.status(500).json({
      error: 'failed_to_get_clean_room_data',
      message: error.message,
    });
  }
});

/**
 * Get basic room data for frontend UI control
 * GET /daily/embed/:roomName
 */
router.get('/embed/:roomName', async (req, res) => {
  try {
    const { roomName } = req.params;

    const room = await callDailyAPI(`/rooms/${roomName}`);

    // Return only essential data - frontend controls all UI
    const embedConfig = {
      room_url: createRoomUrl(roomName),
      room_name: roomName,
      room_data: room,
      // Frontend controls all UI aspects
      frontend_controlled: true,
      // Basic integration data only
      integration_data: {
        room_url: createRoomUrl(roomName),
        room_name: roomName,
        // Frontend builds its own UI
        frontend_controlled: true,
      },
    };

    res.json(embedConfig);
  } catch (error) {
    console.error('Error getting embed config:', error);
    res.status(500).json({
      error: 'failed_to_get_embed_config',
      message: error.message,
    });
  }
});

/**
 * Quick start - create room and get embed config in one call
 * POST /daily/quick-start
 */
router.post('/quick-start', async (req, res) => {
  try {
    const { max_participants = 10, duration = 60, user_id, user_name, enable_recording = false } = req.body;

    // Create room
    const roomName = generateRoomName(req.activeOrgId);
    const roomConfig = {
      name: roomName,
      properties: {
        max_participants,
        enable_recording,
        enable_chat: true,
        enable_screenshare: true,
        enable_prejoin_ui: false,
        enable_network_ui: false,
        // Room expiration
        exp: Math.floor(Date.now() / 1000) + duration * 60,
        // No default theme - frontend controls all styling
      },
    };

    const room = await callDailyAPI('/rooms', 'POST', roomConfig);

    // Create token if user info provided
    let token = null;
    if (user_id && user_name) {
      const tokenData = {
        properties: {
          room_name: roomName,
          user_id,
          user_name,
          is_owner: true,
          exp: Math.floor(Date.now() / 1000) + duration * 60,
        },
      };
      const tokenResponse = await callDailyAPI('/meeting-tokens', 'POST', tokenData);
      token = tokenResponse.token;
    }

    const response = {
      room_id: room.name,
      room_url: createRoomUrl(room.name),
      room_name: room.name,
      max_participants,
      duration_minutes: duration,
      created_at: room.created_at,
      expires_at: new Date(Date.now() + duration * 60 * 1000).toISOString(),
      token,
      // Minimal data - frontend controls everything
      embed: {
        room_url: createRoomUrl(room.name),
        room_name: room.name,
        frontend_controlled: true,
      },
      // Basic integration data only
      integration: {
        room_url: createRoomUrl(room.name),
        room_name: room.name,
        token: token,
        // Frontend builds its own UI
        frontend_controlled: true,
      },
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error in quick start:', error);
    res.status(500).json({
      error: 'failed_to_quick_start',
      message: error.message,
    });
  }
});

// ==================== WEBHOOKS ====================

/**
 * Handle Daily.co webhooks
 * POST /daily/webhooks
 */
router.post('/webhooks', async (req, res) => {
  try {
    const { type, room_name, participant, recording } = req.body;

    console.log('Daily.co Webhook:', { type, room_name, participant });

    // Handle different webhook events
    switch (type) {
      case 'room.started':
        console.log(`Room ${room_name} started`);
        break;
      case 'room.ended':
        console.log(`Room ${room_name} ended`);
        break;
      case 'participant.joined':
        console.log(`Participant ${participant?.user_name} joined room ${room_name}`);
        break;
      case 'participant.left':
        console.log(`Participant ${participant?.user_name} left room ${room_name}`);
        break;
      case 'recording.started':
        console.log(`Recording started for room ${room_name}`);
        break;
      case 'recording.ended':
        console.log(`Recording ended for room ${room_name}: ${recording?.download_link}`);
        break;
      default:
        console.log(`Unhandled webhook type: ${type}`);
    }

    // Track webhook events
    try {
      const { trackVideoCallEvent } = require('../../prometheus');
      trackVideoCallEvent(req.activeOrgId, type, room_name);
    } catch (error) {
      console.error('Error tracking webhook event:', error.message);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({
      error: 'failed_to_handle_webhook',
      message: error.message,
    });
  }
});

module.exports = router;
