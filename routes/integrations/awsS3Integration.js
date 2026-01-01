const express = require('express');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectAclCommand,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
  PutPublicAccessBlockCommand,
  PutBucketAclCommand,
  PutBucketPolicyCommand,
  GetBucketPolicyCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const router = express.Router();


function getOrgS3Credentials(orgId) {
  const accessKeyId = process.env[`${orgId}_AWS_S3_API_KEY`];
  const secretAccessKey = process.env[`${orgId}_AWS_S3_API_SECRET`];
  const region = process.env[`${orgId}_AWS_S3_REGION`];

  if (!accessKeyId || !secretAccessKey || !region) {
    console.error(`[ERROR] Missing AWS S3 credentials for ORG_ID=${orgId}`);
    throw new Error(`AWS S3 credentials are not configured for ORG_ID=${orgId}`);
  }

  const bucketName = `${orgId?.replace('_', '')}`.toLowerCase();
  return { accessKeyId, secretAccessKey, region, bucketName };
}

// Define the required CORS configuration that all buckets should have
// NOTE: OPTIONS method is NOT supported in S3 CORS AllowedMethods - S3 handles OPTIONS preflight requests automatically
const REQUIRED_CORS_CONFIG = {
  CORSRules: [
    {
      AllowedHeaders: ['*'],
      AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
      AllowedOrigins: [
        'http://localhost:3000',
        'https://morcars.crm-system.art',
        'https://jak-to-swim.crm-system.art',
        'https://*.crm-system.art'
      ],
      ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
      MaxAgeSeconds: 86400 // 24 hours
    }
  ]
};

// Function to check if CORS configuration matches our requirements
function corsConfigMatches(currentCors, requiredCors) {
  if (!currentCors || !currentCors.CORSRules || currentCors.CORSRules.length === 0) {
    return false;
  }

  const currentRule = currentCors.CORSRules[0];
  const requiredRule = requiredCors.CORSRules[0];

  // Check if methods match (order doesn't matter)
  const currentMethods = new Set(currentRule.AllowedMethods || []);
  const requiredMethods = new Set(requiredRule.AllowedMethods || []);
  const methodsMatch = currentMethods.size === requiredMethods.size &&
                        [...currentMethods].every((method) => requiredMethods.has(method));

  // Check if origins match (order doesn't matter)
  const currentOrigins = new Set(currentRule.AllowedOrigins || []);
  const requiredOrigins = new Set(requiredRule.AllowedOrigins || []);
  const originsMatch = currentOrigins.size === requiredOrigins.size &&
                        [...currentOrigins].every((origin) => requiredOrigins.has(origin));

  const matches = methodsMatch && originsMatch;
  return matches;
}

// Function to configure a "Super Bucket" with maximum flexibility
async function configureSuperBucket(s3Client, bucketName, region) {
  try {
    // STEP 1: Configure Public Access Block for maximum flexibility
    // This is the key to allowing object-level ACLs while keeping bucket private
    await s3Client.send(new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        // BlockPublicAcls: false - Allow public ACLs on objects (needed for public-read)
        BlockPublicAcls: false,
        // IgnorePublicAcls: false - Don't ignore public ACLs (respect them)
        IgnorePublicAcls: false,
        // BlockPublicPolicy: false - Allow bucket policies to grant public access
        BlockPublicPolicy: false,
        // RestrictPublicBuckets: false - Don't restrict public buckets (allow public objects)
        RestrictPublicBuckets: false
      }
    }));

    // STEP 2: Try to set bucket ACL to private (bucket itself stays private, only objects can be made public)
    // Note: Some buckets have ACLs disabled, so we'll handle this gracefully
    try {
      await s3Client.send(new PutBucketAclCommand({
        Bucket: bucketName,
        ACL: 'private'
      }));
    } catch (aclError) {
      if (aclError.name === 'AccessControlListNotSupported') {
        console.log(`[WARN] Bucket "${bucketName}" does not support ACLs - this is normal for newer buckets`);
        console.log('[INFO] Bucket will use bucket policies instead of ACLs for access control');
      } else {
        console.warn(`[WARN] Failed to set bucket ACL for "${bucketName}":`, aclError.message);
      }
    }

    // STEP 3: Apply CORS configuration
    await s3Client.send(new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: REQUIRED_CORS_CONFIG
    }));
  } catch (error) {
    console.error(`[ERROR] Failed to configure Super Bucket "${bucketName}":`, error.message);
    console.error('[ERROR] Full error details:', JSON.stringify(error, null, 2));
    throw error;
  }
}

// Function to manage public objects using bucket policies (for buckets that don't support ACLs)
async function managePublicObject(s3Client, bucketName, objectKey, makePublic) {
  try {
    // Get current bucket policy
    let currentPolicy = null;
    try {
      const policyResponse = await s3Client.send(new GetBucketPolicyCommand({ Bucket: bucketName }));
      currentPolicy = JSON.parse(policyResponse.Policy);
    } catch (error) {
      if (error.name === 'NoSuchBucketPolicy') {
        currentPolicy = {
          Version: '2012-10-17',
          Statement: []
        };
      } else {
        throw error;
      }
    }

    // Create or update policy statement for this object
    const statementId = `PublicAccess-${objectKey.replace(/[^a-zA-Z0-9]/g, '')}`;

    if (makePublic) {
      // Add public read access for this specific object
      const publicStatement = {
        Sid: statementId,
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${bucketName}/${objectKey}`
      };

      // Remove existing statement for this object if it exists
      currentPolicy.Statement = currentPolicy.Statement.filter((stmt) => stmt.Sid !== statementId);
      // Add the new public statement
      currentPolicy.Statement.push(publicStatement);
    } else {
      // Remove public access for this object
      currentPolicy.Statement = currentPolicy.Statement.filter((stmt) => stmt.Sid !== statementId);
    }

    // Update bucket policy
    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(currentPolicy)
    }));

    return true;
  } catch (error) {
    console.error(`[ERROR] Failed to manage public access for object "${objectKey}":`, error.message);
    throw error;
  }
}

// Function to check and update CORS policy retroactively
async function ensureCorsConfiguration(s3Client, bucketName) {
  try {
    // First, try to get the current CORS configuration
    let currentCors = null;
    try {
      const corsResponse = await s3Client.send(new GetBucketCorsCommand({ Bucket: bucketName }));
      currentCors = corsResponse;
    } catch (corsError) {
      if (corsError.name === 'NoSuchCORSConfiguration') {
        currentCors = null;
      } else {
        console.error('[ERROR] Failed to get CORS configuration:', corsError.message);
        throw corsError;
      }
    }

    // Check if the current CORS configuration matches our requirements
    const needsUpdate = !corsConfigMatches(currentCors, REQUIRED_CORS_CONFIG);

    if (needsUpdate) {
      await s3Client.send(new PutBucketCorsCommand({
        Bucket: bucketName,
        CORSConfiguration: REQUIRED_CORS_CONFIG
      }));
    } else {
    }
  } catch (error) {
    console.error(`[ERROR] Failed to ensure CORS configuration for bucket "${bucketName}":`, error.message);
    console.error('[ERROR] Full error details:', JSON.stringify(error, null, 2));
    // Don't throw here - CORS issues shouldn't break the entire operation
    console.warn('[WARN] Continuing despite CORS configuration failure...');
  }
}

// Function to ensure Public Access Block settings allow using bucket policies for public reads
async function ensurePublicAccessBlock(s3Client, bucketName) {
  try {
    // We optimistically set the configuration to permissive values every time; idempotent
    await s3Client.send(new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false,
      },
    }));
  } catch (error) {
    console.warn(`[WARN] Failed to ensure PublicAccessBlockConfiguration on bucket "${bucketName}": ${error.message}`);
  }
}

async function createS3Client(orgId) {
  const creds = getOrgS3Credentials(orgId);

  const s3Client = new S3Client({
    region: creds.region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  });

  try {
    // Check if bucket exists
    await s3Client.send(new HeadBucketCommand({ Bucket: creds.bucketName }));

    // For existing buckets, ensure CORS is properly configured
    await ensureCorsConfiguration(s3Client, creds.bucketName);
    // Also ensure permissive Public Access Block so bucket policies can grant public reads
    await ensurePublicAccessBlock(s3Client, creds.bucketName);
  } catch (error) {
    if (error.name === 'NotFound' || error.name === 'NoSuchBucket') {
      // Create the bucket
      const createCommand = creds.region === 'us-east-1'
        ? new CreateBucketCommand({ Bucket: creds.bucketName })
        : new CreateBucketCommand({
          Bucket: creds.bucketName,
          CreateBucketConfiguration: {
            LocationConstraint: creds.region
          }
        });

      await s3Client.send(createCommand);

      // Configure the new bucket as a "Super Bucket" with maximum flexibility
      await configureSuperBucket(s3Client, creds.bucketName, creds.region);
    } else {
      console.error(`[ERROR] Failed to access bucket "${creds.bucketName}":`, error.message);
      console.error('[ERROR] Full error details:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  return {
    client: s3Client,
    bucketName: creds.bucketName,
    region: creds.region
  };
}

async function handleS3Operation(orgId, operation) {
  try {
    const s3Config = await createS3Client(orgId);
    return await operation(s3Config);
  } catch (err) {
    console.error('[ERROR] S3 operation failed:', err.message);
    throw err;
  }
}

router.post('/generate-upload-url', async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    const userId = req.auth()?.userId;
    const orgId = req.get('X-ORG-ID');

    if (!fileName || !fileType) {
      return res.status(400).json({ error: '`fileName` and `fileType` are required.' });
    }
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated.' });
    }
    if (!orgId) {
      return res.status(400).json({ error: 'X-ORG-ID header is required' });
    }
    const result = await handleS3Operation(orgId, async ({ client, bucketName }) => {
      const randomBytes = crypto.randomBytes(16).toString('hex');
      // Encode the filename to avoid special characters that cause issues
      const encodedFileName = encodeURIComponent(fileName);
      const objectKey = `${orgId}/${userId}/${randomBytes}-${encodedFileName}`;

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        ContentType: fileType
      });
      const signedUrl = await getSignedUrl(client, command, { expiresIn: 300 });

      return { uploadUrl: signedUrl, objectKey };
    });
    res.status(200).json(result);
  } catch (err) {
    console.error('[ERROR] /generate-upload-url failed:', err);
    console.error('[ERROR] Full error details:', JSON.stringify(err, null, 2));
    res.status(500).json({ error: 'Failed to generate S3 upload URL.' });
  }
});

router.post('/get-private-url', async (req, res) => {
  try {
    const { objectKey } = req.body;
    const orgId = req.get('X-ORG-ID');

    if (!objectKey) {
      return res.status(400).json({ error: '`objectKey` is required.' });
    }
    if (!orgId) {
      return res.status(400).json({ error: 'X-ORG-ID header is required' });
    }
    const result = await handleS3Operation(orgId, async ({ client, bucketName }) => {
      const command = new GetObjectCommand({ Bucket: bucketName, Key: objectKey });
      const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
      return { secureUrl: signedUrl };
    });
    res.status(200).json(result);
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'The specified file does not exist.' });
    }
    console.error('[ERROR] /get-private-url failed:', err);
    console.error('[ERROR] Full error details:', JSON.stringify(err, null, 2));
    res.status(500).json({ error: 'Failed to generate S3 download URL.' });
  }
});

router.delete('/objects', async (req, res) => {
  try {
    const { objectKey } = req.body;
    const orgId = req.get('X-ORG-ID');

    if (!objectKey) {
      return res.status(400).json({ error: '`objectKey` is required in the request body.' });
    }
    if (!orgId) {
      return res.status(400).json({ error: 'X-ORG-ID header is required' });
    }
    const result = await handleS3Operation(orgId, async ({ client, bucketName }) => {
      const command = new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey });
      await client.send(command);
      return { status: 'deleted', objectKey };
    });
    res.status(200).json(result);
  } catch (err) {
    console.error('[ERROR] /objects DELETE failed:', err);
    console.error('[ERROR] Full error details:', JSON.stringify(err, null, 2));
    res.status(500).json({ error: 'Failed to delete S3 object.' });
  }
});

router.post('/objects/make-public', async (req, res) => {
  try {
    const { objectKey } = req.body;
    const orgId = req.get('X-ORG-ID');

    if (!objectKey) {
      return res.status(400).json({ error: '`objectKey` is required.' });
    }
    if (!orgId) {
      return res.status(400).json({ error: 'X-ORG-ID header is required' });
    }
    const result = await handleS3Operation(orgId, async ({ client, bucketName, region }) => {
      // Try ACLs first, fall back to bucket policy if ACLs not supported
      try {
        const command = new PutObjectAclCommand({
          Bucket: bucketName,
          Key: objectKey,
          ACL: 'public-read'
        });
        await client.send(command);
      } catch (aclError) {
        if (aclError.name === 'AccessControlListNotSupported') {
          await managePublicObject(client, bucketName, objectKey, true);
        } else {
          throw aclError;
        }
      }
      const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
      const publicUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${encodedKey}`;

      return { status: 'made_public', objectKey, publicUrl };
    });
    res.status(200).json(result);
  } catch (err) {
    console.error('[ERROR] /objects/make-public failed:', err);
    console.error('[ERROR] Full error details:', JSON.stringify(err, null, 2));
    res.status(500).json({ error: 'Failed to make S3 object public.' });
  }
});


router.post('/objects/make-private', async (req, res) => {
  try {
    const { objectKey } = req.body;
    const orgId = req.get('X-ORG-ID');

    if (!objectKey) {
      return res.status(400).json({ error: '`objectKey` is required.' });
    }
    if (!orgId) {
      return res.status(400).json({ error: 'X-ORG-ID header is required' });
    }
    const result = await handleS3Operation(orgId, async ({ client, bucketName }) => {
      // Try ACLs first, fall back to bucket policy if ACLs not supported
      try {
        const command = new PutObjectAclCommand({
          Bucket: bucketName,
          Key: objectKey,
          ACL: 'private'
        });
        await client.send(command);
      } catch (aclError) {
        if (aclError.name === 'AccessControlListNotSupported') {
          await managePublicObject(client, bucketName, objectKey, false);
        } else {
          throw aclError;
        }
      }
      return { status: 'made_private', objectKey };
    });
    res.status(200).json(result);
  } catch (err) {
    console.error('[ERROR] /objects/make-private failed:', err);
    console.error('[ERROR] Full error details:', JSON.stringify(err, null, 2));
    res.status(500).json({ error: 'Failed to make S3 object private.' });
  }
});


module.exports = router;
