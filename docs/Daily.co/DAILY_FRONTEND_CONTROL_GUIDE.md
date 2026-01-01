# Daily.co Frontend Control Guide

## Overview

This guide shows how to use Daily.co integration with **complete frontend control** over UI and styling. The backend provides only essential data - all UI decisions are made by the frontend.

## Philosophy

- **Backend**: Provides room data and Daily.co API access
- **Frontend**: Controls all UI, styling, themes, and user experience
- **Separation**: Backend has no knowledge of UI specifics

## API Endpoints

### Create Room (UI Agnostic)
```http
POST /daily/rooms
Content-Type: application/json

{
  "max_participants": 10,
  "duration": 60,
  "enable_recording": false,
  "enable_chat": true,
  "enable_screenshare": true
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
  "embed_config": {
    "room_url": "https://crm-system.daily.co/crm-org123-1737201600000-abc123",
    "room_name": "crm-org123-1737201600000-abc123",
    "frontend_controlled": true
  }
}
```

### Quick Start (UI Agnostic)
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
    "room_url": "https://crm-system.daily.co/crm-org123-1737201600000-abc123",
    "room_name": "crm-org123-1737201600000-abc123",
    "frontend_controlled": true
  },
  "integration": {
    "room_url": "https://crm-system.daily.co/crm-org123-1737201600000-abc123",
    "room_name": "crm-org123-1737201600000-abc123",
    "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    "frontend_controlled": true
  }
}
```

### Get Clean Room Data
```http
GET /daily/rooms/:roomName/clean
```

**Response:**
```json
{
  "room_id": "crm-org123-1737201600000-abc123",
  "room_url": "https://crm-system.daily.co/crm-org123-1737201600000-abc123",
  "room_name": "crm-org123-1737201600000-abc123",
  "max_participants": 10,
  "created_at": "2025-01-18T10:00:00Z",
  "config": { /* Daily.co room config */ },
  "properties": { /* Daily.co room properties */ },
  "participants": [ /* Current participants */ ],
  "participant_count": 2,
  "is_active": true,
  "frontend_controlled": true,
  "daily_co_data": {
    "room": { /* Raw Daily.co room data */ },
    "participants": [ /* Raw participant data */ ]
  }
}
```

## Frontend Implementation Examples

### 1. Complete Frontend Control with Daily.co SDK

```html
<!DOCTYPE html>
<html>
<head>
    <title>Custom Video Call UI</title>
    <script src="https://unpkg.com/@daily-co/daily-js"></script>
    <style>
        /* Your custom styling */
        .video-call-container {
            width: 100%;
            height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            flex-direction: column;
        }

        .call-header {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .call-title {
            color: white;
            font-size: 24px;
            font-weight: bold;
        }

        .custom-controls {
            display: flex;
            gap: 15px;
            padding: 20px;
            justify-content: center;
            background: rgba(0, 0, 0, 0.2);
        }

        .control-btn {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: none;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            font-size: 24px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .control-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: scale(1.1);
        }

        .control-btn.active {
            background: #ff6b6b;
        }

        .control-btn.muted {
            background: #ff4757;
        }

        .video-container {
            flex: 1;
            position: relative;
            background: #000;
        }

        .participant-list {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 15px;
            border-radius: 10px;
            min-width: 200px;
        }

        .participant-item {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 5px 0;
        }

        .participant-status {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #2ed573;
        }

        .participant-status.muted {
            background: #ff4757;
        }
    </style>
</head>
<body>
    <div class="video-call-container">
        <div class="call-header">
            <div class="call-title">Custom Video Call</div>
            <button onclick="endCall()" class="control-btn" style="background: #ff4757;">📞</button>
        </div>

        <div class="video-container" id="video-container">
            <div class="participant-list" id="participant-list">
                <h4>Participants</h4>
                <div id="participants"></div>
            </div>
        </div>

        <div class="custom-controls">
            <button id="audio-btn" class="control-btn" onclick="toggleAudio()">🎤</button>
            <button id="video-btn" class="control-btn" onclick="toggleVideo()">📹</button>
            <button id="screen-btn" class="control-btn" onclick="toggleScreenShare()">🖥️</button>
            <button class="control-btn" onclick="toggleChat()">💬</button>
        </div>
    </div>

    <script>
        let callFrame = null;
        let currentRoomUrl = null;
        let currentToken = null;

        async function startCall() {
            try {
                // Get room from backend (no UI assumptions)
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

                // Create Daily.co call frame with YOUR custom settings
                callFrame = DailyIframe.createFrame(document.getElementById('video-container'), {
                    // Hide all Daily.co UI elements
                    showLeaveButton: false,
                    showFullscreenButton: false,
                    showLocalVideo: false,
                    showParticipantsBar: false,
                    showChat: false,
                    showNetworkUI: false,
                    // Your custom theme
                    theme: {
                        accent: '#667eea',
                        accentText: '#ffffff',
                        background: 'transparent',
                        backgroundAccent: 'rgba(255, 255, 255, 0.1)',
                        baseText: '#ffffff',
                        border: 'rgba(255, 255, 255, 0.2)',
                        mainAreaBg: 'transparent',
                        supportiveText: 'rgba(255, 255, 255, 0.7)'
                    }
                });

                // Set up event listeners
                callFrame
                    .on('joined-meeting', handleJoinedMeeting)
                    .on('left-meeting', handleLeftMeeting)
                    .on('participant-joined', handleParticipantJoined)
                    .on('participant-left', handleParticipantLeft)
                    .on('participant-updated', handleParticipantUpdated)
                    .on('error', handleError);

                // Join the call
                await callFrame.join({
                    url: currentRoomUrl,
                    token: currentToken
                });

                console.log('Call started with custom UI:', data);
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
            updateParticipantList([]);
        }

        function toggleAudio() {
            if (callFrame) {
                const newAudioState = !callFrame.localAudio();
                callFrame.setLocalAudio(newAudioState);

                const btn = document.getElementById('audio-btn');
                if (newAudioState) {
                    btn.classList.remove('muted');
                    btn.textContent = '🎤';
                } else {
                    btn.classList.add('muted');
                    btn.textContent = '🔇';
                }
            }
        }

        function toggleVideo() {
            if (callFrame) {
                const newVideoState = !callFrame.localVideo();
                callFrame.setLocalVideo(newVideoState);

                const btn = document.getElementById('video-btn');
                if (newVideoState) {
                    btn.classList.remove('muted');
                    btn.textContent = '📹';
                } else {
                    btn.classList.add('muted');
                    btn.textContent = '📷';
                }
            }
        }

        function toggleScreenShare() {
            if (callFrame) {
                if (callFrame.screenShare()) {
                    callFrame.stopScreenShare();
                    document.getElementById('screen-btn').classList.remove('active');
                } else {
                    callFrame.startScreenShare();
                    document.getElementById('screen-btn').classList.add('active');
                }
            }
        }

        function toggleChat() {
            // Your custom chat implementation
            console.log('Custom chat toggle');
        }

        // Event handlers
        function handleJoinedMeeting(event) {
            console.log('Joined meeting:', event);
            updateParticipantList(callFrame.participants());
        }

        function handleLeftMeeting(event) {
            console.log('Left meeting:', event);
            updateParticipantList([]);
        }

        function handleParticipantJoined(event) {
            console.log('Participant joined:', event);
            updateParticipantList(callFrame.participants());
        }

        function handleParticipantLeft(event) {
            console.log('Participant left:', event);
            updateParticipantList(callFrame.participants());
        }

        function handleParticipantUpdated(event) {
            console.log('Participant updated:', event);
            updateParticipantList(callFrame.participants());
        }

        function handleError(event) {
            console.error('Call error:', event);
            alert('Call error: ' + event.error);
        }

        function updateParticipantList(participants) {
            const container = document.getElementById('participants');
            if (participants.length === 0) {
                container.innerHTML = '<div>No participants</div>';
                return;
            }

            const participantList = participants.map(p => `
                <div class="participant-item">
                    <div class="participant-status ${p.audio ? '' : 'muted'}"></div>
                    <span>${p.user_name || 'Anonymous'}</span>
                    <span>${p.video ? '📹' : '📷'}</span>
                </div>
            `).join('');

            container.innerHTML = participantList;
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

        // Start call when page loads
        window.onload = startCall;
    </script>
</body>
</html>
```

### 2. React Component with Complete Control

```jsx
import React, { useState, useEffect, useRef } from 'react';
import DailyIframe from '@daily-co/daily-react';

const CustomVideoCall = ({
  roomName,
  userName,
  userId,
  onCallEnd,
  customTheme = {},
  customControls = true
}) => {
  const [callFrame, setCallFrame] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const videoContainerRef = useRef(null);

  useEffect(() => {
    if (!roomName || !userName || !userId) return;

    const initializeCall = async () => {
      try {
        // Get room from backend (no UI assumptions)
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

        // Create Daily.co call frame with YOUR custom settings
        const frame = DailyIframe.createFrame(videoContainerRef.current, {
          // Hide all Daily.co UI elements
          showLeaveButton: false,
          showFullscreenButton: false,
          showLocalVideo: false,
          showParticipantsBar: false,
          showChat: false,
          showNetworkUI: false,
          // Your custom theme
          theme: {
            accent: '#667eea',
            accentText: '#ffffff',
            background: 'transparent',
            backgroundAccent: 'rgba(255, 255, 255, 0.1)',
            baseText: '#ffffff',
            border: 'rgba(255, 255, 255, 0.2)',
            mainAreaBg: 'transparent',
            supportiveText: 'rgba(255, 255, 255, 0.7)',
            ...customTheme  // Override with your theme
          }
        });

        // Set up event listeners
        frame
          .on('joined-meeting', handleJoinedMeeting)
          .on('left-meeting', handleLeftMeeting)
          .on('participant-joined', handleParticipantJoined)
          .on('participant-left', handleParticipantLeft)
          .on('participant-updated', handleParticipantUpdated)
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
  };

  const handleParticipantLeft = (event) => {
    console.log('Participant left:', event);
    setParticipants(callFrame.participants());
  };

  const handleParticipantUpdated = (event) => {
    console.log('Participant updated:', event);
    setParticipants(callFrame.participants());
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
    <div className="custom-video-call">
      <div className="call-header">
        <h3>Custom Video Call</h3>
        <button onClick={endCall} className="end-call-btn">📞</button>
      </div>

      <div ref={videoContainerRef} className="video-container" />

      {customControls && (
        <div className="custom-controls">
          <button
            className={`control-btn ${isAudioOn ? '' : 'muted'}`}
            onClick={toggleAudio}
          >
            {isAudioOn ? '🎤' : '🔇'}
          </button>
          <button
            className={`control-btn ${isVideoOn ? '' : 'muted'}`}
            onClick={toggleVideo}
          >
            {isVideoOn ? '📹' : '📷'}
          </button>
          <button
            className={`control-btn ${isScreenSharing ? 'active' : ''}`}
            onClick={toggleScreenShare}
          >
            🖥️
          </button>
        </div>
      )}

      <div className="participant-list">
        <h4>Participants ({participants.length})</h4>
        {participants.map((participant, index) => (
          <div key={index} className="participant-item">
            <div className={`status ${participant.audio ? '' : 'muted'}`} />
            <span>{participant.user_name || 'Anonymous'}</span>
            <span>{participant.video ? '📹' : '📷'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CustomVideoCall;
```

## Key Benefits

1. **Complete UI Control**: Frontend decides all visual aspects
2. **Backend Agnostic**: Backend has no UI knowledge
3. **Flexible Theming**: Any theme can be applied
4. **Custom Controls**: Build your own control interface
5. **Brand Consistency**: Match your app's design perfectly

## Best Practices

1. **Hide Daily.co UI**: Set all `show*` options to `false`
2. **Custom Theme**: Override Daily.co theme with your colors
3. **Event Handling**: Listen to Daily.co events for your UI updates
4. **Error Handling**: Implement your own error handling
5. **Responsive Design**: Make your UI responsive to different screen sizes

This approach gives you complete control over the video call experience while leveraging Daily.co's robust WebRTC infrastructure.
