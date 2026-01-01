# OpenAI Integration Guide

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

The OpenAI integration provides a complete AI chat system with session management, message history, and context-aware processing. It's designed for multi-tenant applications where each organization can have its own OpenAI configuration.

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
# Required: OpenAI API Key for the organization
{ORG_ID}_OPENAI_API_KEY=sk-your-openai-api-key

# Optional: Custom base URL (for OpenAI-compatible APIs)
{ORG_ID}_OPENAI_BASE_URL=https://api.openai.com/v1

# Optional: Default model for the organization
{ORG_ID}_OPENAI_MODEL=gpt-4o

# Optional: Global system prompt
AI_SYSTEM_PROMPT=You are a helpful AI assistant.
```

### Example Configuration

```bash
# For organization "org_medical_clinic"
org_medical_clinic_OPENAI_API_KEY=sk-1234567890abcdef
org_medical_clinic_OPENAI_BASE_URL=https://api.openai.com/v1
org_medical_clinic_OPENAI_MODEL=gpt-4o

# For organization "org_law_firm"
org_law_firm_OPENAI_API_KEY=sk-abcdef1234567890
org_law_firm_OPENAI_MODEL=gpt-4-turbo
```

## API Reference

### Base URL
```
/openai
```

### Authentication
All endpoints require authentication via Clerk middleware. Include the `Authorization` header with your Clerk session token.

### Headers
```
Authorization: Bearer <clerk-session-token>
Content-Type: application/json
```

## Use Cases & Examples

### 1. Doctor AI Assistant

#### Creating a Medical Session

```javascript
// Create a new medical consultation session
const createMedicalSession = async () => {
  const response = await fetch('/openai/sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Patient Consultation - John Doe',
      system_prompt: `You are Dr. AI, a medical assistant. Your role is to:
1. Gather patient symptoms and medical history
2. Ask clarifying questions about symptoms
3. Provide general health information (not medical advice)
4. Suggest when to consult a real doctor
5. Never provide specific medical diagnoses or treatment plans
6. Always recommend professional medical consultation for serious symptoms

Guidelines:
- Be empathetic and professional
- Ask about symptom duration, severity, and triggers
- Inquire about medications and allergies
- Suggest immediate medical attention for emergency symptoms
- Maintain patient confidentiality`
    })
  });

  const session = await response.json();
  console.log('Session created:', session.session_id);
  return session.session_id;
};
```

#### Patient Consultation Flow

```javascript
// Start a patient consultation
const startConsultation = async (sessionId) => {
  const consultationFlow = [
    {
      message: "Hello, I'm Dr. AI. I'm here to help gather information about your health concerns. What symptoms are you experiencing today?",
      role: "assistant"
    }
  ];

  // Send initial greeting
  await sendMessage(sessionId, "Hello, I've been having chest pain for the past 2 days.", consultationFlow);
};

// Send message to AI
const sendMessage = async (sessionId, message, history = []) => {
  const response = await fetch(`/openai/sessions/${sessionId}/ask`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      history: history,
      message: message,
      model: 'gpt-4o' // Use medical-optimized model
    })
  });

  const result = await response.json();
  return result.message_id;
};

// Check message status and get response
const getMessageResponse = async (sessionId, messageId) => {
  const response = await fetch(`/openai/sessions/${sessionId}/messages/${messageId}`, {
    headers: {
      'Authorization': 'Bearer <clerk-token>'
    }
  });

  const message = await response.json();
  return message;
};
```

#### Medical Context Processing

```javascript
// Process medical data for insights
const processMedicalData = async (sessionId, patientData) => {
  const response = await fetch(`/openai/sessions/${sessionId}/ctx`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      task: `Analyze the following patient data and provide structured insights:

      Patient Data: ${JSON.stringify(patientData)}

      Please provide:
      1. Risk assessment (Low/Medium/High)
      2. Recommended follow-up actions
      3. Key symptoms to monitor
      4. Suggested specialist referrals

      Format as JSON with these exact keys: risk_level, follow_up_actions, monitor_symptoms, specialist_referrals`,
      history: [],
      system_prompt: `You are a medical data analyst. Analyze patient information and provide structured medical insights. Always recommend professional medical consultation for any concerning findings.`
    })
  });

  const result = await response.json();
  return result.ctx_id;
};

// Check context processing status
const getContextResult = async (sessionId, ctxId) => {
  const response = await fetch(`/openai/sessions/${sessionId}/ctx/${ctxId}`, {
    headers: {
      'Authorization': 'Bearer <clerk-token>'
    }
  });

  const result = await response.json();
  return result;
};
```

### 2. Legal Assistant

#### Legal Research Session

```javascript
// Create legal research session
const createLegalSession = async () => {
  const response = await fetch('/openai/sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Contract Review - ABC Corp',
      system_prompt: `You are a legal research assistant. Your role is to:
1. Analyze legal documents and contracts
2. Identify potential legal issues and risks
3. Suggest improvements and clarifications
4. Provide relevant case law references
5. Never provide specific legal advice
6. Always recommend consulting with a qualified attorney

Guidelines:
- Be thorough and precise
- Cite relevant legal principles
- Identify ambiguities and gaps
- Suggest protective clauses
- Maintain confidentiality`
    })
  });

  return await response.json();
};

// Legal document analysis
const analyzeContract = async (sessionId, contractText) => {
  const response = await fetch(`/openai/sessions/${sessionId}/ask`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      history: [],
      message: `Please analyze this contract for potential legal issues:

      ${contractText}

      Focus on:
      1. Ambiguous language
      2. Missing clauses
      3. Unfair terms
      4. Compliance issues
      5. Risk assessment`
    })
  });

  return await response.json();
};
```

### 3. Customer Support Assistant

#### Multi-language Support

```javascript
// Create multilingual support session
const createSupportSession = async (language = 'en') => {
  const systemPrompts = {
    en: "You are a helpful customer support agent. Be friendly, professional, and solution-oriented.",
    es: "Eres un agente de atención al cliente útil. Sé amigable, profesional y orientado a soluciones.",
    fr: "Vous êtes un agent de support client utile. Soyez amical, professionnel et orienté solution.",
    de: "Sie sind ein hilfreicher Kundensupport-Agent. Seien Sie freundlich, professionell und lösungsorientiert."
  };

  const response = await fetch('/openai/sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: `Support Session - ${language.toUpperCase()}`,
      system_prompt: systemPrompts[language] || systemPrompts.en
    })
  });

  return await response.json();
};

// Handle support ticket
const handleSupportTicket = async (sessionId, customerMessage, ticketData) => {
  const response = await fetch(`/openai/sessions/${sessionId}/ask`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      history: [],
      message: `Customer Issue: ${customerMessage}

      Ticket Details:
      - Priority: ${ticketData.priority}
      - Category: ${ticketData.category}
      - Customer Tier: ${ticketData.customerTier}

      Please provide a helpful response and suggest next steps.`
    })
  });

  return await response.json();
};
```

### 4. Educational Tutor

#### Personalized Learning Session

```javascript
// Create educational session
const createLearningSession = async (subject, studentLevel) => {
  const response = await fetch('/openai/sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: `${subject} Tutoring - ${studentLevel}`,
      system_prompt: `You are an expert ${subject} tutor for ${studentLevel} level students. Your role is to:
1. Explain concepts clearly and simply
2. Provide examples and analogies
3. Ask questions to check understanding
4. Give positive reinforcement
5. Adapt explanations to student's level
6. Encourage questions and curiosity

Guidelines:
- Use age-appropriate language
- Break down complex topics
- Provide practice problems
- Celebrate correct answers
- Be patient and encouraging`
    })
  });

  return await response.json();
};

// Interactive lesson
const conductLesson = async (sessionId, topic) => {
  const response = await fetch(`/openai/sessions/${sessionId}/ask`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      history: [],
      message: `Let's learn about ${topic}. Please explain it step by step and give me some practice problems to work on.`
    })
  });

  return await response.json();
};
```

## Advanced Features

### Session Management

#### List All Sessions

```javascript
const getSessions = async (limit = 50, includeLastMessage = false) => {
  const response = await fetch(`/openai/sessions?limit=${limit}&include_last=${includeLastMessage}`, {
    headers: {
      'Authorization': 'Bearer <clerk-token>'
    }
  });

  const sessions = await response.json();
  return sessions;
};
```

#### Update Session

```javascript
const updateSession = async (sessionId, updates) => {
  const response = await fetch(`/openai/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });

  return await response.json();
};

// Example: End a session
await updateSession(sessionId, { end: true });

// Example: Update session name
await updateSession(sessionId, { name: 'Updated Session Name' });
```

#### Get Session Details

```javascript
const getSession = async (sessionId) => {
  const response = await fetch(`/openai/sessions/${sessionId}`, {
    headers: {
      'Authorization': 'Bearer <clerk-token>'
    }
  });

  return await response.json();
};
```

### Message Management

#### Get Session Messages

```javascript
const getMessages = async (sessionId, options = {}) => {
  const params = new URLSearchParams({
    limit: options.limit || 50,
    order: options.order || 'desc',
    ...(options.after && { after: options.after })
  });

  const response = await fetch(`/openai/sessions/${sessionId}/messages?${params}`, {
    headers: {
      'Authorization': 'Bearer <clerk-token>'
    }
  });

  return await response.json();
};
```

#### Delete Message

```javascript
const deleteMessage = async (sessionId, messageId) => {
  const response = await fetch(`/openai/sessions/${sessionId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer <clerk-token>'
    }
  });

  return await response.json();
};
```

#### Create Manual Message

```javascript
const createMessage = async (sessionId, role, content) => {
  const response = await fetch(`/openai/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: role, // 'user' or 'assistant'
      content: content
    })
  });

  return await response.json();
};
```

### Context Processing

#### Structured Data Extraction

```javascript
const extractStructuredData = async (sessionId, text, schema) => {
  const response = await fetch(`/openai/sessions/${sessionId}/ctx`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      task: `Extract structured data from the following text according to the schema:

      Text: ${text}

      Schema: ${JSON.stringify(schema)}

      Return only valid JSON matching the schema.`,
      history: [],
      system_prompt: 'You are a data extraction specialist. Extract information accurately and return only valid JSON.'
    })
  });

  return await response.json();
};

// Example: Extract contact information
const contactSchema = {
  name: "string",
  email: "string",
  phone: "string",
  company: "string"
};

const extractedData = await extractStructuredData(
  sessionId,
  "John Smith from ABC Corp can be reached at john@abc.com or 555-1234",
  contactSchema
);
```

#### Document Analysis

```javascript
const analyzeDocument = async (sessionId, documentText, analysisType) => {
  const analysisPrompts = {
    sentiment: "Analyze the sentiment of this text and provide a score from -1 (negative) to 1 (positive).",
    summary: "Provide a concise summary of the key points in this document.",
    keywords: "Extract the most important keywords and phrases from this text.",
    classification: "Classify this document into one of these categories: [legal, medical, technical, business, personal]."
  };

  const response = await fetch(`/openai/sessions/${sessionId}/ctx`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <clerk-token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      task: `${analysisPrompts[analysisType]}

      Document: ${documentText}`,
      history: [],
      system_prompt: 'You are a document analysis expert. Provide accurate and helpful analysis.'
    })
  });

  return await response.json();
};
```

## Error Handling

### Common Error Responses

```javascript
// Handle API errors
const handleApiError = (error, response) => {
  switch (response.status) {
    case 400:
      console.error('Bad Request:', error.error);
      break;
    case 401:
      console.error('Unauthorized:', error.error);
      break;
    case 403:
      console.error('Forbidden:', error.error);
      break;
    case 404:
      console.error('Not Found:', error.error);
      break;
    case 500:
      console.error('Internal Server Error:', error.error);
      break;
    default:
      console.error('Unknown Error:', error);
  }
};

// Example usage with try-catch
const safeApiCall = async (apiFunction) => {
  try {
    const result = await apiFunction();
    return result;
  } catch (error) {
    if (error.response) {
      const errorData = await error.response.json();
      handleApiError(errorData, error.response);
    } else {
      console.error('Network Error:', error.message);
    }
    throw error;
  }
};
```

### Message Status Handling

```javascript
// Poll for message completion
const waitForMessageCompletion = async (sessionId, messageId, maxAttempts = 30) => {
  for (let i = 0; i < maxAttempts; i++) {
    const message = await getMessageResponse(sessionId, messageId);

    if (message.status === 'COMPLETED') {
      return message;
    } else if (message.status === 'FAILED') {
      throw new Error(`Message processing failed: ${message.content}`);
    }

    // Wait 1 second before next check
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Message processing timeout');
};

// Example usage
const sendMessageAndWait = async (sessionId, message, history = []) => {
  const result = await sendMessage(sessionId, message, history);
  const completedMessage = await waitForMessageCompletion(sessionId, result.message_id);
  return completedMessage;
};
```

## Best Practices

### 1. Session Management

```javascript
// Clean up old sessions
const cleanupOldSessions = async (daysOld = 30) => {
  const sessions = await getSessions(1000);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  for (const session of sessions.items) {
    const sessionDate = new Date(session.session_start);
    if (sessionDate < cutoffDate && !session.session_end) {
      await updateSession(session.session_id, { end: true });
    }
  }
};
```

### 2. Rate Limiting

```javascript
// Implement client-side rate limiting
class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async waitIfNeeded() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.requests.push(now);
  }
}

const rateLimiter = new RateLimiter(10, 60000); // 10 requests per minute
```

### 3. Caching

```javascript
// Implement response caching
const messageCache = new Map();

const getCachedMessage = (sessionId, messageId) => {
  const key = `${sessionId}-${messageId}`;
  return messageCache.get(key);
};

const setCachedMessage = (sessionId, messageId, message) => {
  const key = `${sessionId}-${messageId}`;
  messageCache.set(key, message);

  // Clear cache after 1 hour
  setTimeout(() => {
    messageCache.delete(key);
  }, 3600000);
};

const getMessageWithCache = async (sessionId, messageId) => {
  const cached = getCachedMessage(sessionId, messageId);
  if (cached) {
    return cached;
  }

  const message = await getMessageResponse(sessionId, messageId);
  setCachedMessage(sessionId, messageId, message);
  return message;
};
```

### 4. Error Recovery

```javascript
// Implement retry logic with exponential backoff
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Example usage
const sendMessageWithRetry = async (sessionId, message, history = []) => {
  return await retryWithBackoff(() =>
    sendMessage(sessionId, message, history)
  );
};
```

## Troubleshooting

### Common Issues

#### 1. "OpenAI API key not found" Error

```bash
# Check environment variables
echo $org_your_org_id_OPENAI_API_KEY

# Verify org ID format
# Should be: org_[a-zA-Z0-9]+
```

#### 2. "DAOAiObject model missing" Error

```javascript
// Check if organization connection is working
const testConnection = async () => {
  try {
    const response = await fetch('/openai/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer <clerk-token>',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Test Session' })
    });

    if (response.ok) {
      console.log('Connection working');
    } else {
      console.error('Connection failed:', await response.text());
    }
  } catch (error) {
    console.error('Connection error:', error);
  }
};
```

#### 3. Message Processing Timeout

```javascript
// Increase timeout and check message status
const sendMessageWithLongTimeout = async (sessionId, message, history = []) => {
  const result = await sendMessage(sessionId, message, history);

  // Wait up to 5 minutes for completion
  const completedMessage = await waitForMessageCompletion(sessionId, result.message_id, 300);
  return completedMessage;
};
```

#### 4. Rate Limit Exceeded

```javascript
// Handle rate limiting gracefully
const sendMessageWithRateLimit = async (sessionId, message, history = []) => {
  try {
    return await sendMessage(sessionId, message, history);
  } catch (error) {
    if (error.response?.status === 429) {
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 60000));
      return await sendMessage(sessionId, message, history);
    }
    throw error;
  }
};
```

### Debug Mode

```javascript
// Enable debug logging
const debugMode = true;

const debugLog = (message, data = null) => {
  if (debugMode) {
    console.log(`[OpenAI Debug] ${message}`, data);
  }
};

// Example usage in API calls
const sendMessageDebug = async (sessionId, message, history = []) => {
  debugLog('Sending message', { sessionId, message, historyLength: history.length });

  const result = await sendMessage(sessionId, message, history);

  debugLog('Message sent', { messageId: result.message_id });

  return result;
};
```

### Performance Monitoring

```javascript
// Monitor API performance
const performanceMonitor = {
  startTime: null,

  start() {
    this.startTime = Date.now();
  },

  end(operation) {
    const duration = Date.now() - this.startTime;
    console.log(`${operation} took ${duration}ms`);
    return duration;
  }
};

// Example usage
const monitoredSendMessage = async (sessionId, message, history = []) => {
  performanceMonitor.start();

  try {
    const result = await sendMessage(sessionId, message, history);
    performanceMonitor.end('Send Message');
    return result;
  } catch (error) {
    performanceMonitor.end('Send Message (Failed)');
    throw error;
  }
};
```

## Complete Example: Doctor AI Assistant

Here's a complete implementation of a doctor AI assistant:

```javascript
class DoctorAIAssistant {
  constructor(apiToken) {
    this.apiToken = apiToken;
    this.baseUrl = '/openai';
  }

  async createConsultation(patientName) {
    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `Consultation - ${patientName}`,
        system_prompt: `You are Dr. AI, a medical assistant. Your role is to:
1. Gather patient symptoms and medical history
2. Ask clarifying questions about symptoms
3. Provide general health information (not medical advice)
4. Suggest when to consult a real doctor
5. Never provide specific medical diagnoses or treatment plans
6. Always recommend professional medical consultation for serious symptoms

Guidelines:
- Be empathetic and professional
- Ask about symptom duration, severity, and triggers
- Inquire about medications and allergies
- Suggest immediate medical attention for emergency symptoms
- Maintain patient confidentiality`
      })
    });

    const session = await response.json();
    return session.session_id;
  }

  async startConsultation(sessionId) {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/ask`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        history: [],
        message: "Hello, I'm Dr. AI. I'm here to help gather information about your health concerns. What symptoms are you experiencing today?"
      })
    });

    const result = await response.json();
    return await this.waitForResponse(sessionId, result.message_id);
  }

  async sendPatientMessage(sessionId, message, history = []) {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/ask`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        history: history,
        message: message
      })
    });

    const result = await response.json();
    return await this.waitForResponse(sessionId, result.message_id);
  }

  async analyzeSymptoms(sessionId, symptoms) {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/ctx`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        task: `Analyze these symptoms and provide structured insights:

        Symptoms: ${symptoms}

        Please provide:
        1. Risk assessment (Low/Medium/High)
        2. Recommended follow-up actions
        3. Key symptoms to monitor
        4. Suggested specialist referrals

        Format as JSON with these exact keys: risk_level, follow_up_actions, monitor_symptoms, specialist_referrals`,
        history: [],
        system_prompt: `You are a medical data analyst. Analyze patient information and provide structured medical insights. Always recommend professional medical consultation for any concerning findings.`
      })
    });

    const result = await response.json();
    return await this.waitForContextResult(sessionId, result.ctx_id);
  }

  async getConversationHistory(sessionId) {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/messages`, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`
      }
    });

    return await response.json();
  }

  async endConsultation(sessionId) {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ end: true })
    });

    return await response.json();
  }

  async waitForResponse(sessionId, messageId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const message = await this.getMessage(sessionId, messageId);

      if (message.status === 'COMPLETED') {
        return message;
      } else if (message.status === 'FAILED') {
        throw new Error(`Message processing failed: ${message.content}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Message processing timeout');
  }

  async waitForContextResult(sessionId, ctxId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.getContextResult(sessionId, ctxId);

      if (result.status === 'done') {
        return result;
      } else if (result.status === 'error') {
        throw new Error(`Context processing failed: ${result.error}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Context processing timeout');
  }

  async getMessage(sessionId, messageId) {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/messages/${messageId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`
      }
    });

    return await response.json();
  }

  async getContextResult(sessionId, ctxId) {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/ctx/${ctxId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`
      }
    });

    return await response.json();
  }
}

// Usage example
const doctorAI = new DoctorAIAssistant('your-clerk-token');

// Start a consultation
const sessionId = await doctorAI.createConsultation('John Doe');
const initialResponse = await doctorAI.startConsultation(sessionId);
console.log('Dr. AI:', initialResponse.content);

// Patient responds
const patientResponse = await doctorAI.sendPatientMessage(
  sessionId,
  "I've been having chest pain for the past 2 days. It's a sharp pain that comes and goes.",
  [{ role: 'assistant', content: initialResponse.content }]
);
console.log('Dr. AI:', patientResponse.content);

// Analyze symptoms
const analysis = await doctorAI.analyzeSymptoms(sessionId, "Chest pain, 2 days duration, sharp, intermittent");
console.log('Analysis:', analysis.result);

// End consultation
await doctorAI.endConsultation(sessionId);
```

This comprehensive guide provides everything needed to implement and use the OpenAI integration effectively, with real-world examples and best practices for production use.
