async function validateProxyType(req, res, next) {
  try {
    const { ProxyConfig } = req.models;
    const { activeOrgId } = req;
    const { type } = req.params;

    if (!type) {
      return res.status(400).json({ error: 'Type parameter is required' });
    }

    // Определяем, публичный ли запрос
    const isPublicRequest = req.originalUrl?.startsWith('/public/proxy') || req.path?.startsWith('/public/proxy');

    // Ищем конфигурацию для этого типа в организации
    const config = await ProxyConfig.findOne({
      organizationId: activeOrgId,
      type: type,
    }).lean();

    if (!config) {
      return res.status(404).json({ error: 'Type is not allowed or does not exist' });
    }

    // Проверяем isPublic
    if (isPublicRequest && !config.isPublic) {
      return res.status(404).json({ error: 'Type is not allowed or does not exist' });
    }

    // Проверяем, что текущий HTTP метод разрешен
    if (!config.enabledMethods || !config.enabledMethods.includes(req.method)) {
      return res.status(404).json({ error: 'Type is not allowed or does not exist' });
    }

    // Сохраняем конфигурацию в req для использования в роутере
    // Ensure type is included in config for easy access
    req.proxyConfig = { ...config, type: type };
    // Also ensure req.params.type is set (for compatibility)
    if (!req.params) {
      req.params = {};
    }
    if (!req.params.type) {
      req.params.type = type;
    }

    next();
  } catch (err) {
    console.error('🛑 validateProxyType failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = validateProxyType;

