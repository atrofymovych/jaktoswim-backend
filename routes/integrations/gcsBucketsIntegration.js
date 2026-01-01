const express = require('express');
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');
const router = express.Router();
const storage = new Storage();
const upload = multer({ storage: multer.memoryStorage() });

const orgBucketMap = {
  org_2zbiM3GXBaulTnCdlqimkqnPUTE: 'jak-to-swim',
  org_2zmXGAn5R70nSzO0N7BmTplvIce: 'mor-cars',
  org_WkRST1dPV1pEUk9XT1c: 'zdrowow',
};

function getBucketByOrgId(orgId) {
  const bucketName = orgBucketMap[orgId];
  if (!bucketName) throw new Error(`Unknown orgId: ${orgId}`);
  return bucketName;
}

function normalizePath(path) {
  return path ? path.replace(/^\/+|\/+$/g, '') : '';
}

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const orgId = req.activeOrgId;
    const { path: folder = '' } = req.query;
    const bucketName = getBucketByOrgId(orgId);

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let filename = req.file.originalname;
    if (folder) filename = `${normalizePath(folder)}/${filename}`;

    const blob = storage.bucket(bucketName).file(filename);
    const stream = blob.createWriteStream({
      resumable: false,
      contentType: req.file.mimetype,
    });

    stream.on('error', (err) => res.status(500).json({ error: err.message }));
    stream.on('finish', () => {
      res.json({
        status: 'uploaded',
        filename,
        bucket: bucketName,
        publicUrl: `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(filename)}`,
      });
    });

    stream.end(req.file.buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const orgId = req.activeOrgId;
    const { path: folder = '' } = req.query;
    const bucketName = getBucketByOrgId(orgId);

    const options = {};
    if (folder) options.prefix = `${normalizePath(folder)}/`;

    const [files] = await storage.bucket(bucketName).getFiles(options);
    res.json(
      files.map((f) => ({
        name: f.name,
        publicUrl: `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(f.name)}`,
      }))
    );
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/public/*', async (req, res) => {
  try {
    const orgId = req.activeOrgId;
    const filename = req.params[0];
    const bucketName = getBucketByOrgId(orgId);

    const file = storage.bucket(bucketName).file(filename);
    file
      .createReadStream()
      .on('error', (err) => res.status(404).json({ error: 'File not found' }))
      .pipe(res);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/public-url/*', (req, res) => {
  try {
    const orgId = req.activeOrgId;
    const filename = req.params[0];
    const bucketName = getBucketByOrgId(orgId);

    const url = `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(filename)}`;
    res.json({ publicUrl: url });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/private-url/*', async (req, res) => {
  try {
    const orgId = req.activeOrgId;
    const filename = req.params[0];
    const bucketName = getBucketByOrgId(orgId);

    const file = storage.bucket(bucketName).file(filename);
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });

    res.json({ signedUrl });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/*', async (req, res) => {
  try {
    const orgId = req.activeOrgId;
    const filename = req.params[0];
    const bucketName = getBucketByOrgId(orgId);

    await storage.bucket(bucketName).file(filename).delete();
    res.json({ status: 'deleted', filename });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
