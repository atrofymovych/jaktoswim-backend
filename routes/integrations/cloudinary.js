const express = require('express');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const router = express.Router();

// Глобальная конфигурация здесь больше не нужна, но пакет все равно импортируем ради утилит

router.post('/generate-upload-signature', async (req, res) => {
  try {
    const orgId = req.get('X-ORG-ID');
    if (!orgId) {
      return res.status(400).json({ error: 'X-ORG-ID header is required.' });
    }

    // 1. Получаем ключи, специфичные для организации
    const apiKey = process.env[`${orgId}_CLOUDINARY_API_KEY`];
    const apiSecret = process.env[`${orgId}_CLOUDINARY_API_SECRET`];

    // Проверяем, что сервер настроен для этой организации
    if (!apiKey || !apiSecret) {
      console.error(`🛑  Cloudinary credentials not found for ORG_ID: ${orgId}`);
      console.error(`${apiKey} = api key, ${apiSecret} = api secret, ${orgId} - org id`);
      return res.status(500).json({ error: 'Server is not configured for this organization.' });
    }

    const timestamp = Math.round(new Date().getTime() / 1000);

    const paramsToSign = {
      timestamp,
      type: 'private', // <-- Вот это изменение
    };

    // 2. Используем правильный apiSecret для подписи
    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

    // 3. Возвращаем правильный apiKey
    res.status(200).json({
      signature,
      timestamp,
      apiKey, // Возвращаем ключ этой организации
    });
  } catch (err) {
    console.error('🛑  generate-upload-signature failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/get-private-url', async (req, res) => {
  try {
    const orgId = req.get('X-ORG-ID');
    if (!orgId) {
      return res.status(400).json({ error: 'X-ORG-ID header is required.' });
    }

    // Получаем все ключи, специфичные для организации
    const cloudName = process.env[`${orgId}_CLOUDINARY_CLOUD_NAME`];
    const apiKey = process.env[`${orgId}_CLOUDINARY_API_KEY`];
    const apiSecret = process.env[`${orgId}_CLOUDINARY_API_SECRET`];

    if (!cloudName || !apiKey || !apiSecret) {
      console.error(`🛑  Cloudinary credentials not found for ORG_ID: ${orgId}`);
      return res.status(500).json({ error: 'Server is not configured for this organization.' });
    }

    const { DAOObject } = req.models;
    const { id } = req.body;

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Field "id" must be a valid ObjectId' });
    }

    const fileObject = await DAOObject.findOne({
      _id: id,
      'metadata.orgId': req.activeOrgId,
    }).lean();
    if (!fileObject) {
      return res.status(404).json({ error: 'File object not found in this organization.' });
    }

    const { public_id, resource_type, type } = JSON.parse(fileObject.data);
    if (!public_id || !resource_type || type === 'upload') {
      return res.status(400).json({ error: 'The requested object is not a valid private file.' });
    }

    // 4. Используем специальную утилиту для безопасной генерации URL без изменения глобального конфига
    const signedUrl = cloudinary.utils.private_download_url(public_id, '', {
      resource_type,
      type,
      expires_at: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
      // Передаем ключи для этой конкретной операции
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    res.status(200).json({ secureUrl: signedUrl });
  } catch (err) {
    console.error('🛑  get-private-url failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

module.exports = router;
