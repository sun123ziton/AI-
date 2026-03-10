const axios = require('axios');

function normalizeDataUrl(imageBase64) {
  if (!imageBase64) return null;
  if (imageBase64.startsWith('data:')) return imageBase64;
  return `data:image/png;base64,${imageBase64}`;
}

function extractTextFromArk(respData) {
  if (!respData) return '';
  if (typeof respData === 'string') return respData;
  if (respData.output_text) return respData.output_text;
  if (respData.output && typeof respData.output.text === 'string') return respData.output.text;
  if (Array.isArray(respData.output?.choices) && respData.output.choices[0]?.message?.content) {
    return respData.output.choices[0].message.content;
  }
  if (Array.isArray(respData.output)) {
    const texts = [];
    for (const item of respData.output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (typeof c?.text === 'string') texts.push(c.text);
        if (typeof c?.output_text === 'string') texts.push(c.output_text);
        if (typeof c?.content === 'string') texts.push(c.content);
      }
    }
    if (texts.length) return texts.join('\n');
  }
  if (respData.result && typeof respData.result === 'string') return respData.result;
  try {
    return JSON.stringify(respData);
  } catch (_) {
    return '';
  }
}

function stripCodeFences(text) {
  if (!text) return '';
  const trimmed = String(text).trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const lines = trimmed.split('\n');
  const lastFence = lines.lastIndexOf('```');
  if (lastFence <= 0) return trimmed;
  return lines.slice(1, lastFence).join('\n').trim();
}

function safeParseJsonFromText(text) {
  if (!text) return null;
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch (_) {}
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const maybeJson = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(maybeJson);
    } catch (_) {}
  }
  return null;
}

function keywordFallback(source, max) {
  const base = (source || '').toString();
  const sep = /[，。、“”‘’！？：；,.!?:;\s/\\|]+/g;
  const parts = base.split(sep).map(s => s.trim()).filter(Boolean);
  const bag = [];
  const seen = new Set();
  for (const p of parts) {
    const s = p.slice(0, 16);
    if (s.length >= 2 && !seen.has(s)) {
      seen.add(s);
      bag.push(s);
    }
    if (bag.length >= max) break;
  }
  if (bag.length === 0) {
    return ['生活日常', '分享心情', '记录此刻', '氛围感', '有点意思', '走走看看'].slice(0, max);
  }
  return bag.slice(0, max);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const { image_base64, image_url, max_tags = 6, language = 'zh' } = req.body || {};
    if (!image_base64 && !image_url) {
      return res.status(400).json({ error: 'image payload required', has_base64: false, has_url: false });
    }
    if (!process.env.ARK_API_KEY) {
      return res.status(500).json({ error: 'Server missing ARK_API_KEY' });
    }
    const httpUrl = typeof image_url === 'string' && image_url.length > 5 ? image_url : null;
    const imageUrl = httpUrl || normalizeDataUrl(image_base64);
    const descLang = language === 'zh' ? '中文' : language;
    const prompt =
      `请对这张图片进行简短${descLang}描述，并给出不超过${max_tags}个` +
      `适合作为字幕内容的简短标签或短句。` +
      `请严格输出JSON：{"description":"...","tags":["..."]}，只输出JSON，不要包含其他解释。`;
    const payload = {
      model: process.env.ARK_MODEL_ID || 'doubao-seed-1-6-251015',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: imageUrl },
            { type: 'input_text', text: prompt }
          ]
        }
      ]
    };
    const arkResp = await axios.post(
      'https://ark.cn-beijing.volces.com/api/v3/responses',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.ARK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );
    const text = extractTextFromArk(arkResp.data);
    const parsed = safeParseJsonFromText(text);
    if (parsed && typeof parsed === 'object') {
      const desc = parsed.description || text || 'AI分析结果';
      let tags = Array.isArray(parsed.tags) ? parsed.tags : [];
      tags = tags.map(x => (x || '').toString().trim()).filter(Boolean);
      if (tags.length === 0) {
        const fromText = keywordFallback(desc, max_tags);
        return res.json({ description: desc, tags: fromText });
      }
      return res.json({ description: desc, tags: tags.slice(0, max_tags) });
    }
    const fallbackTags = (text || '有趣;搞笑;生活;记录;心情;日常')
      .replace(/[\r\n]+/g, ' ')
      .split(/[，,;；\s]+/)
      .filter(Boolean)
      .slice(0, max_tags);
    return res.json({
      description: text || 'AI分析结果',
      tags: fallbackTags
    });
  } catch (err) {
    return res.json({
      description: 'AI服务暂时不可用，为您推荐通用标签',
      tags: ['记录生活', '美好瞬间', '快乐每一天', '值得纪念', 'Keep Real', '氛围感']
    });
  }
};
