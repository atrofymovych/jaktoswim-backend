# Daily.co Video Call Integration Guide

## Overview

This guide covers the integration of Daily.co video calling functionality into your CRM system. Daily.co provides a robust, embeddable video calling solution that can be seamlessly integrated into your application.

## Features

- **Room Management**: Create, update, delete, and list video call rooms
- **Participant Management**: Track and manage room participants
- **Token-based Authentication**: Secure access with meeting tokens
- **Recording**: Start/stop room recordings
- **Custom Styling**: Branded video call interface
- **Webhooks**: Real-time event notifications
- **Frontend Integration**: Ready-to-use embed configurations

## Setup

### 1. Environment Variables

Add these environment variables to your `.env` file:

```bash
# Daily.co Configuration
DAILY_API_KEY=your_daily_api_key_here
DAILY_DOMAIN=crm-system.daily.co  # Optional: your custom domain
```

### 2. API Key Setup

1. Go to [Daily.co Dashboard](https://dashboard.daily.co/)
2. Navigate to "Developers" → "API Keys"
3. Create a new API key
4. Copy the key to your environment variables

## API Endpoints

### Room Management

#### Create Room
```http
POST /daily/rooms
Content-Type: application/json

{
  "name": "crm-meeting-123",           // Optional: auto-generated if not provided
  "max_participants": 10,              // Optional: default 10
  "duration": 60,                      // Optional: default 60 minutes
  "enable_recording": false,           // Optional: default false
  "enable_chat": true,                 // Optional: default true
  "enable_screenshare": true,          // Optional: default true
  "enable_prejoin_ui": false,          // Optional: default false
  "participants": [],                  // Optional: participant list
  "metadata": {                        // Optional: custom metadata
    "meeting_type": "client_call",
    "priority": "high"
  }
}
```

**Response:**
```json
{
  "room_id": "crm-meeting-123",
  "room_url": "https://crm-system.daily.co/crm-meeting-123",
  "room_name": "crm-meeting-123",
  "max_participants": 10,
  "duration_minutes": 60,
  "created_at": "2025-01-18T10:00:00Z",
  "expires_at": "2025-01-18T11:00:00Z",
  "participants": [],
  "metadata": {
    "meeting_type": "client_call",
    "priority": "high",
    "org_id": "your_org_id",
    "created_by": "user_123",
    "source": "crm-integration"
  },
  "embed_config": {
    "iframe_url": "https://crm-system.daily.co/crm-meeting-123",
    "sdk_config": {
      "showLeaveButton": true,
      "showFullscreenButton": true,
      "showLocalVideo": true,
      "showParticipantsBar": true,
      "theme": {
        "accent": "#007bff",
        "accentText": "#ffffff",
        "background": "#ffffff",
        "backgroundAccent": "#f8f9fa",
        "baseText": "#000000",
        "border": "#e1e5e9",
        "mainAreaBg": "#ffffff",
        "supportiveText": "#6c757d"
      }
    }
  }
}
```

#### Get Room Details
```http
GET /daily/rooms/{roomName}
```

#### Update Room
```http
PUT /daily/rooms/{roomName}
Content-Type: application/json

{
  "max_participants": 20,
  "enable_recording": true,
  "duration": 120
}
```

#### Delete Room
```http
DELETE /daily/rooms/{roomName}
```

#### List Rooms
```http
GET /daily/rooms?limit=50&ending_before=room_id&starting_after=room_id
```

### Participant Management

#### Get Participants
```http
GET /daily/rooms/{roomName}/participants
```

**Response:**
```json
{
  "room_name": "crm-meeting-123",
  "participants": [
    {
      "id": "participant_123",
      "user_id": "user_456",
      "user_name": "John Doe",
      "join_time": "2025-01-18T10:05:00Z",
      "duration": 300,
      "status": "active",
      "is_owner": true,
      "is_local": false,
      "media": {
        "audio": true,
        "video": true,
        "screen": false
      }
    }
  ],
  "total": 1
}
```

#### Remove Participant
```http
DELETE /daily/rooms/{roomName}/participants/{participantId}
```

### Token Management

#### Create Meeting Token
```http
POST /daily/rooms/{roomName}/token
Content-Type: application/json

{
  "user_id": "user_123",
  "user_name": "John Doe",
  "is_owner": true,                    // Optional: default false
  "exp": 3600,                        // Optional: default 3600 seconds
  "permissions": ["can_send", "can_admin"]  // Optional: default permissions
}
```

**Response:**
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "room_name": "crm-meeting-123",
  "user_id": "user_123",
  "user_name": "John Doe",
  "is_owner": true,
  "expires_at": "2025-01-18T11:00:00Z",
  "permissions": ["can_send", "can_admin"]
}
```

### Recording Management

#### Start Recording
```http
POST /daily/rooms/{roomName}/recording
Content-Type: application/json

{
  "layout": "default",                // Optional: default, grid, spotlight
  "output_format": "mp4",            // Optional: mp4, webm
  "resolution": "1080p"              // Optional: 720p, 1080p, 1440p
}
```

#### Stop Recording
```http
DELETE /daily/rooms/{roomName}/recording
```

### Quick Start

#### Create Room and Get Embed Config
```http
POST /daily/quick-start
Content-Type: application/json

{
  "max_participants": 10,
  "duration": 60,
  "user_id": "user_123",
  "user_name": "John Doe",
  "enable_recording": false
}
```

**Response:**
```json
{
  "room_id": "crm-org123-1737201600000-abc123",
  "room_url": "https://crm-system.daily.co/crm-org123-1737201600000-abc123",
  "room_name": "crm-org123-1737201600000-abc123",
  "max_participants": 10,
  "duration_minutes": 60,
  "created_at": "2025-01-18T10:00:00Z",
  "expires_at": "2025-01-18T11:00:00Z",
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "embed": {
    "iframe_url": "https://crm-system.daily.co/crm-org123-1737201600000-abc123",
    "sdk_config": {
      "showLeaveButton": true,
      "showFullscreenButton": true,
      "showLocalVideo": true,
      "showParticipantsBar": true,
      "theme": { /* theme object */ }
    }
  },
  "integration": {
    "iframe": "<iframe src=\"https://crm-system.daily.co/crm-org123-1737201600000-abc123\" width=\"100%\" height=\"600px\" frameborder=\"0\"></iframe>",
    "javascript": "const callFrame = DailyIframe.createFrame(document.getElementById('call-container')); callFrame.join({ url: 'https://crm-system.daily.co/crm-org123-1737201600000-abc123', token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...' });",
    "share_url": "https://crm-system.daily.co/crm-org123-1737201600000-abc123"
  }
}
```

### Frontend Integration

#### Get Embed Configuration
```http
GET /daily/embed/{roomName}?showLeaveButton=true&showFullscreenButton=true&showLocalVideo=true&showParticipantsBar=true&theme=default
```

## Frontend Implementation Examples

### 1. Simple Iframe Integration

```html
<!DOCTYPE html>
<html>
<head>
    <title>Video Call - CRM System</title>
    <style>
        .call-container {
            width: 100%;
            height: 600px;
            border: 1px solid #ddd;
            border-radius: 8px;
            overflow: hidden;
        }
        .call-controls {
            margin: 20px 0;
            text-align: center;
        }
        .btn {
            padding: 10px 20px;
            margin: 0 10px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        .btn-primary {
            background-color: #007bff;
            color: white;
        }
        .btn-secondary {
            background-color: #6c757d;
            color: white;
        }
    </style>
</head>
<body>
    <div class="call-controls">
        <button class="btn btn-primary" onclick="startCall()">Start Call</button>
        <button class="btn btn-secondary" onclick="endCall()">End Call</button>
    </div>

    <div id="call-container" class="call-container"></div>

    <script>
        let currentRoomUrl = null;

        async function startCall() {
            try {
                // Create room via API
                const response = await fetch('/daily/quick-start', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + getAuthToken()
                    },
                    body: JSON.stringify({
                        max_participants: 10,
                        duration: 60,
                        user_id: getCurrentUserId(),
                        user_name: getCurrentUserName(),
                        enable_recording: false
                    })
                });

                const data = await response.json();
                currentRoomUrl = data.room_url;

                // Create iframe
                const container = document.getElementById('call-container');
                container.innerHTML = `
                    <iframe
                        src="${data.room_url}"
                        width="100%"
                        height="100%"
                        frameborder="0"
                        allow="camera; microphone; fullscreen; speaker; display-capture">
                    </iframe>
                `;

                console.log('Call started:', data);
            } catch (error) {
                console.error('Error starting call:', error);
                alert('Failed to start call. Please try again.');
            }
        }

        function endCall() {
            const container = document.getElementById('call-container');
            container.innerHTML = '';
            currentRoomUrl = null;
        }

        // Helper functions (implement based on your auth system)
        function getAuthToken() {
            return localStorage.getItem('auth_token');
        }

        function getCurrentUserId() {
            return localStorage.getItem('user_id');
        }

        function getCurrentUserName() {
            return localStorage.getItem('user_name');
        }
    </script>
</body>
</html>
```

### 2. Daily.co SDK Integration

```html
<!DOCTYPE html>
<html>
<head>
    <title>Video Call with SDK - CRM System</title>
    <script src="https://unpkg.com/@daily-co/daily-js"></script>
    <style>
        .call-container {
            width: 100%;
            height: 600px;
            border: 1px solid #ddd;
            border-radius: 8px;
            overflow: hidden;
        }
        .call-controls {
            margin: 20px 0;
            text-align: center;
        }
        .btn {
            padding: 10px 20px;
            margin: 0 10px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        .btn-primary {
            background-color: #007bff;
            color: white;
        }
        .btn-secondary {
            background-color: #6c757d;
            color: white;
        }
        .btn-danger {
            background-color: #dc3545;
            color: white;
        }
        .participant-info {
            margin: 10px 0;
            padding: 10px;
            background-color: #f8f9fa;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="call-controls">
        <button class="btn btn-primary" onclick="startCall()">Start Call</button>
        <button class="btn btn-secondary" onclick="toggleAudio()">Toggle Audio</button>
        <button class="btn btn-secondary" onclick="toggleVideo()">Toggle Video</button>
        <button class="btn btn-secondary" onclick="toggleScreenShare()">Share Screen</button>
        <button class="btn btn-danger" onclick="endCall()">End Call</button>
    </div>

    <div id="call-container" class="call-container"></div>
    <div id="participant-info" class="participant-info"></div>

    <script>
        let callFrame = null;
        let currentRoomUrl = null;
        let currentToken = null;

        async function startCall() {
            try {
                // Create room via API
                const response = await fetch('/daily/quick-start', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + getAuthToken()
                    },
                    body: JSON.stringify({
                        max_participants: 10,
                        duration: 60,
                        user_id: getCurrentUserId(),
                        user_name: getCurrentUserName(),
                        enable_recording: false
                    })
                });

                const data = await response.json();
                currentRoomUrl = data.room_url;
                currentToken = data.token;

                // Create Daily.co call frame
                callFrame = DailyIframe.createFrame(document.getElementById('call-container'), {
                    showLeaveButton: true,
                    showFullscreenButton: true,
                    showLocalVideo: true,
                    showParticipantsBar: true,
                    theme: {
                        accent: '#007bff',
                        accentText: '#ffffff',
                        background: '#ffffff',
                        backgroundAccent: '#f8f9fa',
                        baseText: '#000000',
                        border: '#e1e5e9',
                        mainAreaBg: '#ffffff',
                        supportiveText: '#6c757d'
                    }
                });

                // Set up event listeners
                callFrame
                    .on('joined-meeting', handleJoinedMeeting)
                    .on('left-meeting', handleLeftMeeting)
                    .on('participant-joined', handleParticipantJoined)
                    .on('participant-left', handleParticipantLeft)
                    .on('error', handleError);

                // Join the call
                await callFrame.join({
                    url: currentRoomUrl,
                    token: currentToken
                });

                console.log('Call started with SDK:', data);
            } catch (error) {
                console.error('Error starting call:', error);
                alert('Failed to start call. Please try again.');
            }
        }

        function endCall() {
            if (callFrame) {
                callFrame.leave();
                callFrame.destroy();
                callFrame = null;
            }
            currentRoomUrl = null;
            currentToken = null;
            updateParticipantInfo([]);
        }

        function toggleAudio() {
            if (callFrame) {
                callFrame.setLocalAudio(!callFrame.localAudio());
            }
        }

        function toggleVideo() {
            if (callFrame) {
                callFrame.setLocalVideo(!callFrame.localVideo());
            }
        }

        function toggleScreenShare() {
            if (callFrame) {
                if (callFrame.screenShare()) {
                    callFrame.stopScreenShare();
                } else {
                    callFrame.startScreenShare();
                }
            }
        }

        // Event handlers
        function handleJoinedMeeting(event) {
            console.log('Joined meeting:', event);
            updateParticipantInfo(callFrame.participants());
        }

        function handleLeftMeeting(event) {
            console.log('Left meeting:', event);
            updateParticipantInfo([]);
        }

        function handleParticipantJoined(event) {
            console.log('Participant joined:', event);
            updateParticipantInfo(callFrame.participants());
        }

        function handleParticipantLeft(event) {
            console.log('Participant left:', event);
            updateParticipantInfo(callFrame.participants());
        }

        function handleError(event) {
            console.error('Call error:', event);
            alert('Call error: ' + event.error);
        }

        function updateParticipantInfo(participants) {
            const infoDiv = document.getElementById('participant-info');
            if (participants.length === 0) {
                infoDiv.innerHTML = 'No participants in call';
                return;
            }

            const participantList = participants.map(p =>
                `<div>${p.user_name || 'Anonymous'} (${p.audio ? '🎤' : '🔇'} ${p.video ? '📹' : '📷'})</div>`
            ).join('');

            infoDiv.innerHTML = `
                <strong>Participants (${participants.length}):</strong><br>
                ${participantList}
            `;
        }

        // Helper functions (implement based on your auth system)
        function getAuthToken() {
            return localStorage.getItem('auth_token');
        }

        function getCurrentUserId() {
            return localStorage.getItem('user_id');
        }

        function getCurrentUserName() {
            return localStorage.getItem('user_name');
        }
    </script>
</body>
</html>
```

### 3. React Component

```jsx
import React, { useState, useEffect, useRef } from 'react';
import DailyIframe from '@daily-co/daily-react';

const VideoCall = ({
  roomName,
  userName,
  userId,
  onCallEnd,
  onParticipantUpdate
}) => {
  const [callFrame, setCallFrame] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const callContainerRef = useRef(null);

  useEffect(() => {
    if (!roomName || !userName || !userId) return;

    const initializeCall = async () => {
      try {
        // Create room via API
        const response = await fetch('/daily/quick-start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + getAuthToken()
          },
          body: JSON.stringify({
            max_participants: 10,
            duration: 60,
            user_id: userId,
            user_name: userName,
            enable_recording: false
          })
        });

        const data = await response.json();

        // Create Daily.co call frame
        const frame = DailyIframe.createFrame(callContainerRef.current, {
          showLeaveButton: true,
          showFullscreenButton: true,
          showLocalVideo: true,
          showParticipantsBar: true,
          theme: {
            accent: '#007bff',
            accentText: '#ffffff',
            background: '#ffffff',
            backgroundAccent: '#f8f9fa',
            baseText: '#000000',
            border: '#e1e5e9',
            mainAreaBg: '#ffffff',
            supportiveText: '#6c757d'
          }
        });

        // Set up event listeners
        frame
          .on('joined-meeting', handleJoinedMeeting)
          .on('left-meeting', handleLeftMeeting)
          .on('participant-joined', handleParticipantJoined)
          .on('participant-left', handleParticipantLeft)
          .on('error', handleError);

        // Join the call
        await frame.join({
          url: data.room_url,
          token: data.token
        });

        setCallFrame(frame);
        setIsJoined(true);
      } catch (error) {
        console.error('Error starting call:', error);
        alert('Failed to start call. Please try again.');
      }
    };

    initializeCall();

    return () => {
      if (callFrame) {
        callFrame.leave();
        callFrame.destroy();
      }
    };
  }, [roomName, userName, userId]);

  const handleJoinedMeeting = (event) => {
    console.log('Joined meeting:', event);
    setParticipants(callFrame.participants());
    if (onParticipantUpdate) {
      onParticipantUpdate(callFrame.participants());
    }
  };

  const handleLeftMeeting = (event) => {
    console.log('Left meeting:', event);
    setParticipants([]);
    setIsJoined(false);
    if (onCallEnd) {
      onCallEnd();
    }
  };

  const handleParticipantJoined = (event) => {
    console.log('Participant joined:', event);
    setParticipants(callFrame.participants());
    if (onParticipantUpdate) {
      onParticipantUpdate(callFrame.participants());
    }
  };

  const handleParticipantLeft = (event) => {
    console.log('Participant left:', event);
    setParticipants(callFrame.participants());
    if (onParticipantUpdate) {
      onParticipantUpdate(callFrame.participants());
    }
  };

  const handleError = (event) => {
    console.error('Call error:', event);
    alert('Call error: ' + event.error);
  };

  const toggleAudio = () => {
    if (callFrame) {
      const newAudioState = !callFrame.localAudio();
      callFrame.setLocalAudio(newAudioState);
      setIsAudioOn(newAudioState);
    }
  };

  const toggleVideo = () => {
    if (callFrame) {
      const newVideoState = !callFrame.localVideo();
      callFrame.setLocalVideo(newVideoState);
      setIsVideoOn(newVideoState);
    }
  };

  const toggleScreenShare = () => {
    if (callFrame) {
      if (callFrame.screenShare()) {
        callFrame.stopScreenShare();
        setIsScreenSharing(false);
      } else {
        callFrame.startScreenShare();
        setIsScreenSharing(true);
      }
    }
  };

  const endCall = () => {
    if (callFrame) {
      callFrame.leave();
      callFrame.destroy();
      setCallFrame(null);
    }
    setIsJoined(false);
    if (onCallEnd) {
      onCallEnd();
    }
  };

  return (
    <div className="video-call-container">
      <div className="call-controls">
        <button
          className={`btn ${isAudioOn ? 'btn-primary' : 'btn-secondary'}`}
          onClick={toggleAudio}
        >
          {isAudioOn ? '🎤 Mute' : '🔇 Unmute'}
        </button>
        <button
          className={`btn ${isVideoOn ? 'btn-primary' : 'btn-secondary'}`}
          onClick={toggleVideo}
        >
          {isVideoOn ? '📹 Stop Video' : '📷 Start Video'}
        </button>
        <button
          className={`btn ${isScreenSharing ? 'btn-danger' : 'btn-secondary'}`}
          onClick={toggleScreenShare}
        >
          {isScreenSharing ? '🖥️ Stop Share' : '🖥️ Share Screen'}
        </button>
        <button className="btn btn-danger" onClick={endCall}>
          📞 End Call
        </button>
      </div>

      <div
        ref={callContainerRef}
        className="call-container"
        style={{ width: '100%', height: '600px', border: '1px solid #ddd', borderRadius: '8px' }}
      />

      <div className="participant-info">
        <strong>Participants ({participants.length}):</strong>
        {participants.map((participant, index) => (
          <div key={index}>
            {participant.user_name || 'Anonymous'}
            ({participant.audio ? '🎤' : '🔇'} {participant.video ? '📹' : '📷'})
          </div>
        ))}
      </div>
    </div>
  );
};

export default VideoCall;
```

## Webhooks

Daily.co can send webhooks for various events. Configure webhooks in your Daily.co dashboard:

**Webhook URL:** `https://your-domain.com/daily/webhooks`

**Supported Events:**
- `room.started` - Room started
- `room.ended` - Room ended
- `participant.joined` - Participant joined
- `participant.left` - Participant left
- `recording.started` - Recording started
- `recording.ended` - Recording ended

## Error Handling

The API returns standardized error responses:

```json
{
  "error": "error_code",
  "message": "Human readable error message"
}
```

**Common Error Codes:**
- `failed_to_create_room` - Room creation failed
- `failed_to_get_room` - Room not found
- `failed_to_update_room` - Room update failed
- `failed_to_delete_room` - Room deletion failed
- `failed_to_get_participants` - Failed to get participants
- `failed_to_remove_participant` - Failed to remove participant
- `failed_to_create_token` - Token creation failed
- `failed_to_start_recording` - Recording start failed
- `failed_to_stop_recording` - Recording stop failed
- `failed_to_handle_webhook` - Webhook handling failed

## Best Practices

1. **Room Naming**: Use descriptive room names with organization prefixes
2. **Token Expiration**: Set appropriate token expiration times
3. **Recording**: Enable recording only when necessary
4. **Error Handling**: Always handle API errors gracefully
5. **Cleanup**: Delete rooms when no longer needed
6. **Security**: Use tokens for participant authentication
7. **Monitoring**: Monitor webhook events for analytics

## Troubleshooting

### Common Issues

1. **Room Creation Fails**
   - Check API key configuration
   - Verify network connectivity
   - Check room name format

2. **Participants Can't Join**
   - Verify room exists
   - Check token validity
   - Ensure proper permissions

3. **Recording Issues**
   - Verify recording is enabled
   - Check storage limits
   - Monitor webhook events

4. **Frontend Integration Issues**
   - Check iframe permissions
   - Verify HTTPS requirements
   - Test in different browsers

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=daily:*
```

## Support

For additional support:
- [Daily.co Documentation](https://docs.daily.co/)
- [Daily.co Community](https://community.daily.co/)
- [Daily.co Support](https://help.daily.co/)
