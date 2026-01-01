# DeepSeek Integration Guide

## Table of Contents
1. [Overview](#overview)
2. [Setup & Configuration](#setup--configuration)
3. [API Reference](#api-reference)
4. [Use Cases & Examples](#use-cases--examples)
5. [Advanced Features](#advanced-features)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

## Overview

The DeepSeek integration provides a complete AI chat system with session management, message history, and context-aware processing. It's designed for multi-tenant applications where each organization can have its own DeepSeek configuration.

### Key Features
- **Session Management**: Create, update, and manage AI chat sessions
- **Message History**: Store and retrieve conversation history
- **Context Processing**: Execute structured tasks with AI
- **Multi-tenant Support**: Organization-specific API keys and models
- **Caching**: Optimized performance with intelligent caching
- **Monitoring**: Built-in metrics and response time tracking

## Setup & Configuration

### Environment Variables

For each organization, set these environment variables:

```bash
# Required: DeepSeek API Key for the organization
{ORG_ID}_DEEPSEEK_API_KEY=sk-your-deepseek-api-key

# Optional: Custom base URL (defaults to https://api.deepseek.com/v1)
{ORG_ID}_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# Optional: Default model for the organization
{ORG_ID}_DEEPSEEK_MODEL=deepseek-chat

# Optional: Global system prompt
AI_SYSTEM_PROMPT=You are a helpful AI assistant.
```

### Example Configuration

```bash
# For organization "org_medical_clinic"
org_medical_clinic_DEEPSEEK_API_KEY=sk-1234567890abcdef
org_medical_clinic_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
org_medical_clinic_DEEPSEEK_MODEL=deepseek-chat

# For organization "org_law_firm"
org_law_firm_DEEPSEEK_API_KEY=sk-abcdef1234567890
org_law_firm_DEEPSEEK_MODEL=deepseek-chat
```

## API Reference

### Base URL
```
/deepseek
```

### Authentication
All endpoints require authentication via Clerk middleware. Include the `Authorization` header with your Clerk session token.

### Endpoints

#### Create Session
```http
POST /deepseek/sessions
Content-Type: application/json
Authorization: Bearer <clerk-token>

{
  "name": "My Chat Session",
  "system_prompt": "You are a helpful assistant.",
  "metadata": {
    "category": "general",
    "priority": "high"
  }
}
```

**Response:**
```json
{
  "session_id": "64f8a1b2c3d4e5f6a7b8c9d0",
  "name": "My Chat Session",
  "system_prompt": "You are a helpful assistant.",
  "metadata": {
    "category": "general",
    "priority": "high"
  },
  "created_at": "2024-01-15T10:30:00.000Z"
}
```

#### Get Session
```http
GET /deepseek/sessions/{sessionId}
Authorization: Bearer <clerk-token>
```

#### Update Session
```http
PUT /deepseek/sessions/{sessionId}
Content-Type: application/json
Authorization: Bearer <clerk-token>

{
  "name": "Updated Session Name",
  "system_prompt": "Updated system prompt"
}
```

#### Delete Session
```http
DELETE /deepseek/sessions/{sessionId}
Authorization: Bearer <clerk-token>
```

#### List Sessions
```http
GET /deepseek/sessions?limit=50&offset=0
Authorization: Bearer <clerk-token>
```

#### Ask Question (Async)
```http
POST /deepseek/sessions/{sessionId}/ask
Content-Type: application/json
Authorization: Bearer <clerk-token>

{
  "message": "What is the capital of France?",
  "model": "deepseek-chat",
  "system_prompt": "You are a geography expert."
}
```

**Response:**
```json
{
  "message_id": "64f8a1b2c3d4e5f6a7b8c9d1"
}
```

#### Get Message Status
```http
GET /deepseek/messages/{messageId}
Authorization: Bearer <clerk-token>
```

**Response:**
```json
{
  "message_id": "64f8a1b2c3d4e5f6a7b8c9d1",
  "session_id": "64f8a1b2c3d4e5f6a7b8c9d0",
  "role": "assistant",
  "content": "The capital of France is Paris.",
  "status": "COMPLETED",
  "metadata": {
    "model": "deepseek-chat"
  },
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T10:30:05.000Z"
}
```

#### Context-Aware Task
```http
POST /deepseek/sessions/{sessionId}/ctx
Content-Type: application/json
Authorization: Bearer <clerk-token>

{
  "task": "Analyze this data and provide insights",
  "model": "deepseek-chat"
}
```

#### Get Session Messages
```http
GET /deepseek/sessions/{sessionId}/messages?limit=100&offset=0
Authorization: Bearer <clerk-token>
```

## Use Cases & Examples

### 1. AI Doctor Assistant (Frontend Implementation)

Here's a complete example of implementing an AI doctor assistant on the frontend:

#### HTML Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Doctor Assistant</title>
    <style>
        .chat-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            font-family: Arial, sans-serif;
        }
        .chat-header {
            background: #2c5aa0;
            color: white;
            padding: 15px;
            border-radius: 8px 8px 0 0;
            text-align: center;
        }
        .chat-messages {
            height: 400px;
            overflow-y: auto;
            border: 1px solid #ddd;
            padding: 15px;
            background: #f9f9f9;
        }
        .message {
            margin: 10px 0;
            padding: 10px;
            border-radius: 8px;
            max-width: 70%;
        }
        .user-message {
            background: #007bff;
            color: white;
            margin-left: auto;
        }
        .assistant-message {
            background: white;
            border: 1px solid #ddd;
        }
        .typing-indicator {
            display: none;
            color: #666;
            font-style: italic;
        }
        .input-container {
            display: flex;
            gap: 10px;
            padding: 15px;
            border: 1px solid #ddd;
            border-top: none;
            border-radius: 0 0 8px 8px;
        }
        .message-input {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .send-button {
            padding: 10px 20px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .send-button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .symptoms-form {
            background: #e3f2fd;
            padding: 15px;
            margin: 10px 0;
            border-radius: 8px;
        }
        .symptom-item {
            display: flex;
            align-items: center;
            margin: 5px 0;
        }
        .symptom-item input {
            margin-right: 10px;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h2>🩺 AI Doctor Assistant</h2>
            <p>I can help with medical questions and symptom analysis. Please note: This is not a substitute for professional medical advice.</p>
        </div>

        <div class="chat-messages" id="chatMessages">
            <div class="message assistant-message">
                <strong>AI Doctor:</strong> Hello! I'm your AI medical assistant. I can help you with:
                <ul>
                    <li>General health questions</li>
                    <li>Symptom analysis</li>
                    <li>Medication information</li>
                    <li>Health tips and advice</li>
                </ul>
                <p><strong>Important:</strong> This is for informational purposes only. Always consult with a healthcare professional for medical concerns.</p>
            </div>
        </div>

        <div class="typing-indicator" id="typingIndicator">
            AI Doctor is typing...
        </div>

        <div class="input-container">
            <input type="text" id="messageInput" class="message-input" placeholder="Describe your symptoms or ask a medical question..." />
            <button id="sendButton" class="send-button">Send</button>
        </div>
    </div>

    <script>
        class AIDoctorAssistant {
            constructor() {
                this.sessionId = null;
                this.isLoading = false;
                this.initializeEventListeners();
                this.createSession();
            }

            async createSession() {
                try {
                    const response = await fetch('/deepseek/sessions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.getAuthToken()}`
                        },
                        body: JSON.stringify({
                            name: 'AI Doctor Assistant Session',
                            system_prompt: `You are an AI medical assistant. Your role is to:

1. Provide general health information and education
2. Help users understand symptoms and conditions
3. Suggest when to seek professional medical care
4. Offer health tips and preventive advice
5. Explain medications and treatments in simple terms

IMPORTANT GUIDELINES:
- Always emphasize that you are not a substitute for professional medical advice
- Never provide specific diagnoses
- Always recommend consulting healthcare professionals for serious concerns
- Be empathetic and supportive
- Use clear, non-technical language
- If symptoms seem serious, strongly recommend immediate medical attention
- Never provide specific dosages or medical prescriptions

Be helpful, professional, and always prioritize patient safety.`,
                            metadata: {
                                type: 'medical_assistant',
                                version: '1.0',
                                disclaimer: 'For informational purposes only'
                            }
                        })
                    });

                    if (response.ok) {
                        const session = await response.json();
                        this.sessionId = session.session_id;
                        console.log('Medical session created:', this.sessionId);
                    } else {
                        throw new Error('Failed to create session');
                    }
                } catch (error) {
                    console.error('Error creating session:', error);
                    this.showError('Failed to initialize AI Doctor. Please refresh the page.');
                }
            }

            initializeEventListeners() {
                const messageInput = document.getElementById('messageInput');
                const sendButton = document.getElementById('sendButton');

                sendButton.addEventListener('click', () => this.sendMessage());
                messageInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.sendMessage();
                    }
                });
            }

            async sendMessage() {
                const messageInput = document.getElementById('messageInput');
                const message = messageInput.value.trim();

                if (!message || this.isLoading || !this.sessionId) return;

                // Add user message to chat
                this.addMessage(message, 'user');
                messageInput.value = '';
                this.setLoading(true);

                try {
                    const response = await fetch(`/deepseek/sessions/${this.sessionId}/ask`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.getAuthToken()}`
                        },
                        body: JSON.stringify({
                            message: message,
                            model: 'deepseek-chat'
                        })
                    });

                    if (response.ok) {
                        const result = await response.json();
                        await this.waitForResponse(result.message_id);
                    } else {
                        throw new Error('Failed to send message');
                    }
                } catch (error) {
                    console.error('Error sending message:', error);
                    this.addMessage('Sorry, I encountered an error. Please try again.', 'assistant');
                } finally {
                    this.setLoading(false);
                }
            }

            async waitForResponse(messageId) {
                const maxAttempts = 30; // 30 seconds timeout
                let attempts = 0;

                const checkResponse = async () => {
                    try {
                        const response = await fetch(`/deepseek/messages/${messageId}`, {
                            headers: {
                                'Authorization': `Bearer ${this.getAuthToken()}`
                            }
                        });

                        if (response.ok) {
                            const message = await response.json();

                            if (message.status === 'COMPLETED') {
                                this.addMessage(message.content, 'assistant');
                                return;
                            } else if (message.status === 'FAILED') {
                                this.addMessage('Sorry, I encountered an error processing your request.', 'assistant');
                                return;
                            }
                        }

                        attempts++;
                        if (attempts < maxAttempts) {
                            setTimeout(checkResponse, 1000);
                        } else {
                            this.addMessage('Sorry, the response is taking longer than expected. Please try again.', 'assistant');
                        }
                    } catch (error) {
                        console.error('Error checking response:', error);
                        this.addMessage('Sorry, I encountered an error. Please try again.', 'assistant');
                    }
                };

                checkResponse();
            }

            addMessage(content, sender) {
                const chatMessages = document.getElementById('chatMessages');
                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${sender}-message`;

                const senderName = sender === 'user' ? 'You' : 'AI Doctor';
                messageDiv.innerHTML = `<strong>${senderName}:</strong> ${this.formatMessage(content)}`;

                chatMessages.appendChild(messageDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }

            formatMessage(content) {
                // Convert line breaks to HTML
                return content.replace(/\n/g, '<br>');
            }

            setLoading(loading) {
                this.isLoading = loading;
                const sendButton = document.getElementById('sendButton');
                const typingIndicator = document.getElementById('typingIndicator');

                sendButton.disabled = loading;
                typingIndicator.style.display = loading ? 'block' : 'none';
            }

            showError(message) {
                this.addMessage(`❌ ${message}`, 'assistant');
            }

            getAuthToken() {
                // Replace with your actual authentication token
                // This could come from Clerk, localStorage, or another auth system
                return localStorage.getItem('authToken') || 'your-auth-token-here';
            }
        }

        // Initialize the AI Doctor Assistant when page loads
        document.addEventListener('DOMContentLoaded', () => {
            new AIDoctorAssistant();
        });
    </script>
</body>
</html>
```

#### React Component Example
```jsx
import React, { useState, useEffect, useRef } from 'react';

const AIDoctorAssistant = () => {
    const [messages, setMessages] = useState([
        {
            id: 1,
            content: "Hello! I'm your AI medical assistant. I can help with general health questions, symptom analysis, and health tips. Remember: This is for informational purposes only. Always consult healthcare professionals for medical concerns.",
            sender: 'assistant'
        }
    ]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        createSession();
    }, []);

    const createSession = async () => {
        try {
            const response = await fetch('/deepseek/sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    name: 'AI Doctor Assistant Session',
                    system_prompt: `You are an AI medical assistant. Provide helpful health information while always emphasizing the need for professional medical consultation. Be empathetic, clear, and prioritize patient safety.`,
                    metadata: {
                        type: 'medical_assistant',
                        version: '1.0'
                    }
                })
            });

            if (response.ok) {
                const session = await response.json();
                setSessionId(session.session_id);
            }
        } catch (error) {
            console.error('Error creating session:', error);
        }
    };

    const sendMessage = async () => {
        if (!inputMessage.trim() || isLoading || !sessionId) return;

        const userMessage = {
            id: Date.now(),
            content: inputMessage,
            sender: 'user'
        };

        setMessages(prev => [...prev, userMessage]);
        setInputMessage('');
        setIsLoading(true);

        try {
            const response = await fetch(`/deepseek/sessions/${sessionId}/ask`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    message: inputMessage,
                    model: 'deepseek-chat'
                })
            });

            if (response.ok) {
                const result = await response.json();
                await waitForResponse(result.message_id);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            addMessage('Sorry, I encountered an error. Please try again.', 'assistant');
        } finally {
            setIsLoading(false);
        }
    };

    const waitForResponse = async (messageId) => {
        const maxAttempts = 30;
        let attempts = 0;

        const checkResponse = async () => {
            try {
                const response = await fetch(`/deepseek/messages/${messageId}`, {
                    headers: {
                        'Authorization': `Bearer ${getAuthToken()}`
                    }
                });

                if (response.ok) {
                    const message = await response.json();

                    if (message.status === 'COMPLETED') {
                        addMessage(message.content, 'assistant');
                        return;
                    } else if (message.status === 'FAILED') {
                        addMessage('Sorry, I encountered an error processing your request.', 'assistant');
                        return;
                    }
                }

                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(checkResponse, 1000);
                } else {
                    addMessage('Sorry, the response is taking longer than expected. Please try again.', 'assistant');
                }
            } catch (error) {
                console.error('Error checking response:', error);
                addMessage('Sorry, I encountered an error. Please try again.', 'assistant');
            }
        };

        checkResponse();
    };

    const addMessage = (content, sender) => {
        const newMessage = {
            id: Date.now(),
            content,
            sender
        };
        setMessages(prev => [...prev, newMessage]);
    };

    const getAuthToken = () => {
        // Replace with your actual authentication logic
        return localStorage.getItem('authToken') || 'your-auth-token-here';
    };

    return (
        <div className="ai-doctor-assistant">
            <div className="chat-header">
                <h2>🩺 AI Doctor Assistant</h2>
                <p>For informational purposes only. Consult healthcare professionals for medical concerns.</p>
            </div>

            <div className="chat-messages">
                {messages.map((message) => (
                    <div key={message.id} className={`message ${message.sender}-message`}>
                        <strong>{message.sender === 'user' ? 'You' : 'AI Doctor'}:</strong>
                        <div dangerouslySetInnerHTML={{ __html: message.content.replace(/\n/g, '<br>') }} />
                    </div>
                ))}
                {isLoading && (
                    <div className="typing-indicator">
                        AI Doctor is typing...
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="input-container">
                <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Describe your symptoms or ask a medical question..."
                    disabled={isLoading}
                />
                <button onClick={sendMessage} disabled={isLoading || !inputMessage.trim()}>
                    Send
                </button>
            </div>
        </div>
    );
};

export default AIDoctorAssistant;
```

#### CSS Styles
```css
.ai-doctor-assistant {
    max-width: 800px;
    margin: 0 auto;
    font-family: Arial, sans-serif;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
}

.chat-header {
    background: #2c5aa0;
    color: white;
    padding: 15px;
    text-align: center;
}

.chat-header h2 {
    margin: 0 0 5px 0;
}

.chat-header p {
    margin: 0;
    font-size: 14px;
    opacity: 0.9;
}

.chat-messages {
    height: 400px;
    overflow-y: auto;
    padding: 15px;
    background: #f9f9f9;
}

.message {
    margin: 10px 0;
    padding: 10px;
    border-radius: 8px;
    max-width: 70%;
}

.user-message {
    background: #007bff;
    color: white;
    margin-left: auto;
}

.assistant-message {
    background: white;
    border: 1px solid #ddd;
}

.typing-indicator {
    color: #666;
    font-style: italic;
    padding: 10px;
}

.input-container {
    display: flex;
    gap: 10px;
    padding: 15px;
    border-top: 1px solid #ddd;
    background: white;
}

.input-container input {
    flex: 1;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
}

.input-container button {
    padding: 10px 20px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.input-container button:disabled {
    background: #ccc;
    cursor: not-allowed;
}
```

### 2. Customer Support Chat
```javascript
// Create a customer support session
const session = await fetch('/deepseek/sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    name: 'Customer Support Chat',
    system_prompt: 'You are a helpful customer support agent. Be polite and professional.',
    metadata: { department: 'support', priority: 'high' }
  })
});

// Ask a question
const response = await fetch(`/deepseek/sessions/${sessionId}/ask`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    message: 'I need help with my order',
    model: 'deepseek-chat'
  })
});
```

### 2. Code Review Assistant
```javascript
// Create a code review session
const session = await fetch('/deepseek/sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    name: 'Code Review Session',
    system_prompt: 'You are an expert code reviewer. Analyze code for bugs, performance issues, and best practices.',
    metadata: { type: 'code_review', language: 'javascript' }
  })
});

// Review code with context
const review = await fetch(`/deepseek/sessions/${sessionId}/ctx`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    task: 'Review this JavaScript function for potential issues: function add(a, b) { return a + b; }. Requirements: Handle edge cases and type safety.'
  })
});
```

### 3. Data Analysis
```javascript
// Analyze data with context
const analysis = await fetch(`/deepseek/sessions/${sessionId}/ctx`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    task: 'Analyze this sales data and provide insights. Q1: $100,000, Q2: $120,000, Q3: $95,000, Q4: $140,000. Focus on revenue, growth, and trends.'
  })
});
```

## Advanced Features

### 1. Custom Models
You can specify different DeepSeek models per request:
- `deepseek-chat` (default)
- `deepseek-coder`
- Custom models via base URL

### 2. System Prompts
- **Global**: Set via `AI_SYSTEM_PROMPT` environment variable
- **Session-level**: Set when creating or updating sessions
- **Request-level**: Override per request

### 3. Context-Aware Processing
Use the `/ctx` endpoint for structured tasks. The endpoint automatically includes the full conversation history for context.

### 4. Caching
- Session data cached for 5 minutes
- Message data cached for 10 minutes
- Automatic cache invalidation on updates

## Error Handling

### Common Error Codes
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (no active organization)
- `404` - Not Found (session/message not found)
- `500` - Internal Server Error

### Error Response Format
```json
{
  "error": "error_code",
  "message": "Human readable error message"
}
```

### Handling Async Operations
All AI operations are asynchronous. Check message status using the returned `message_id`:

```javascript
const askResponse = await fetch('/deepseek/sessions/123/ask', { ... });
const { message_id } = await askResponse.json();

// Poll for completion
let message;
do {
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
  const response = await fetch(`/deepseek/messages/${message_id}`);
  message = await response.json();
} while (message.status === 'PENDING');
```

## Best Practices

### 1. Session Management
- Use descriptive session names
- Set appropriate system prompts
- Clean up unused sessions regularly

### 2. Message Handling
- Always check message status before displaying
- Implement proper error handling for failed messages
- Use appropriate timeouts for async operations

### 3. Performance
- Use caching effectively
- Limit message history length
- Batch operations when possible

### 4. Security
- Never expose API keys in client-side code
- Validate all input data
- Use proper authentication

## Troubleshooting

### Common Issues

#### 1. API Key Not Found
**Error**: `DeepSeek API key not found for ORG_ID=...`
**Solution**: Ensure the environment variable `{ORG_ID}_DEEPSEEK_API_KEY` is set correctly.

#### 2. Invalid Session ID
**Error**: `invalid_session_id`
**Solution**: Ensure the session ID is a valid MongoDB ObjectId.

#### 3. Message Stuck in PENDING
**Possible Causes**:
- Network connectivity issues
- Invalid API key
- Rate limiting
- Server overload

**Solutions**:
- Check API key validity
- Verify network connectivity
- Check server logs for errors
- Implement retry logic

#### 4. Slow Response Times
**Solutions**:
- Use caching
- Optimize message history length
- Consider using faster models
- Check server resources

### Debug Mode
Enable debug logging by setting:
```bash
DEBUG=deepseek:*
```

### Monitoring
The integration includes built-in metrics tracking:
- Response times
- Success/failure rates
- Message counts
- Session statistics

Access metrics at `/metrics` endpoint (if Prometheus is configured).
