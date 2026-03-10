document.addEventListener('DOMContentLoaded', () => {
    const imageLoader = document.getElementById('imageLoader');
    const generateBtn = document.getElementById('generateBtn');
    const saveBtn = document.getElementById('saveBtn');
    const aiGenerateBtn = document.getElementById('ai-generate-btn');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    let currentImage = null;
    const apiBase = location.protocol === 'file:' ? 'http://localhost:3000' : '';

    if (location.protocol === 'file:') {
        const banner = document.createElement('div');
        banner.textContent = '当前使用 file:// 打开页面。AI 建议需要启动后端并通过 http://localhost:3000 访问。';
        banner.style.cssText = 'max-width:800px;width:100%;background:#fff3cd;color:#664d03;border:1px solid #ffecb5;border-radius:6px;padding:10px 12px;margin:0 0 12px 0;box-sizing:border-box;';
        const h1 = document.querySelector('h1');
        if (h1 && h1.parentNode) h1.parentNode.insertBefore(banner, h1.nextSibling);
    }

    imageLoader.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                currentImage = img;
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    generateBtn.addEventListener('click', () => {
        if (!currentImage) {
            alert('请先上传一张图片！');
            return;
        }

        const subtitleHeight = parseInt(document.getElementById('subtitleHeight').value, 10);
        const fontSize = parseInt(document.getElementById('fontSize').value, 10);
        const fontColor = document.getElementById('fontColor').value;
        const outlineColor = document.getElementById('outlineColor').value;
        const bgOpacity = parseFloat(document.getElementById('bgOpacity').value);
        const subtitleText = document.getElementById('subtitleText').value;

        canvas.width = currentImage.width;
        canvas.height = currentImage.height + subtitleHeight;
        ctx.drawImage(currentImage, 0, 0);

        ctx.fillStyle = `rgba(0, 0, 0, ${isNaN(bgOpacity) ? 1 : Math.max(0, Math.min(1, bgOpacity))})`;
        ctx.fillRect(0, currentImage.height, canvas.width, subtitleHeight);

        ctx.font = `${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillStyle = fontColor;
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = 2;

        const lines = subtitleText.split('\n');
        const lineHeight = fontSize * 1.4; // 增加行高，避免拥挤
        const totalTextHeight = lines.length * lineHeight;
        
        // 使用 textBaseline = 'middle' 来更精准地控制垂直居中
        // 计算起始Y坐标：黑色背景条的中心点 - 总文本高度的一半
        const centerY = currentImage.height + (subtitleHeight / 2);
        const startY = centerY - (totalTextHeight / 2) + (lineHeight / 2);

        ctx.textBaseline = 'middle'; 

        lines.forEach((line, index) => {
            const y = startY + (index * lineHeight);
            // 稍微上移一点点，视觉上更平衡
            const visualY = y - (fontSize * 0.1); 
            ctx.strokeText(line, canvas.width / 2, visualY);
            ctx.fillText(line, canvas.width / 2, visualY);
        });
    });

    saveBtn.addEventListener('click', () => {
        if (!currentImage) {
            alert('没有可保存的图片！');
            return;
        }
        const link = document.createElement('a');
        link.download = 'subtitle-image.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    aiGenerateBtn.addEventListener('click', async () => {
        if (!currentImage) {
            alert('请先上传一张图片以获取AI建议！');
            return;
        }

        aiGenerateBtn.textContent = '正在分析...';
        aiGenerateBtn.disabled = true;

        try {
            const urlInput = document.getElementById('imageUrl');
            const userUrl = urlInput && urlInput.value && urlInput.value.trim();
            const useRemoteUrl = userUrl && /^https?:\/\//i.test(userUrl);
            const dataUrl = useRemoteUrl ? null : getCompressedDataUrl(currentImage, 1024, 0.85);
            console.log('sending to backend', { useRemoteUrl, hasDataUrl: !!dataUrl, dataUrlLength: dataUrl ? dataUrl.length : 0 });
            const resp = await fetch(`${apiBase}/api/subtitle-suggestions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_base64: dataUrl, image_url: useRemoteUrl ? userUrl : undefined })
            });
            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(`后端接口错误：${resp.status} ${errText}`);
            }
            const data = await resp.json();
            const descEl = document.getElementById('ai-desc');
            if (descEl) descEl.textContent = data && typeof data.description === 'string' ? data.description : '';
            const tags = Array.isArray(data.tags) ? data.tags : [];
            displayAISuggestions(tags);
        } catch (error) {
            console.error('AI suggestion error:', error);
            // 最终兜底：如果连后端都连不上，前端直接生成建议
            displayAISuggestions(['美好生活', '保持热爱', '记录当下', '元气满满', 'Happy Day']);
            const descEl = document.getElementById('ai-desc');
            if (descEl) descEl.textContent = '网络或服务异常，为您推荐通用标签';
        } finally {
            aiGenerateBtn.textContent = '获取AI建议';
            aiGenerateBtn.disabled = false;
        }
    });

    function getCompressedDataUrl(img, maxWidth = 1024, quality = 0.85) {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const octx = off.getContext('2d');
        octx.drawImage(img, 0, 0, w, h);
        return off.toDataURL('image/jpeg', quality);
    }

    function displayAISuggestions(suggestions) {
        const tagsContainer = document.getElementById('ai-tags');
        tagsContainer.innerHTML = '';
        let cleaned = (Array.isArray(suggestions) ? suggestions : [])
            .map(s => (s == null ? '' : String(s)).trim())
            .filter(Boolean);

        if (cleaned.length === 0) {
            cleaned = ['记录此刻', '分享心情', '今日份快乐', '氛围感', '小小心事', '生活日常'];
        }

        cleaned.forEach(tagText => {
            const tag = document.createElement('span');
            tag.textContent = tagText;
            tag.onclick = () => {
                const subtitleTextArea = document.getElementById('subtitleText');
                subtitleTextArea.value += (subtitleTextArea.value ? '\n' : '') + tagText;
            };
            tagsContainer.appendChild(tag);
        });
    }

});
