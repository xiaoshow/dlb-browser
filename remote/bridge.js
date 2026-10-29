async function (op, args) {
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return (r.width > 0 && r.height > 0) || el === document.body || el.children.length > 0 }
  const inputBox = () => {
    const c = [...document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')].filter(vis)
    c.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)
    return c[0] || null
  }
  const scroller = () => {
    // Anchor to the composer, not text length: the activity panel can contain
    // far more text than the conversation. If alignment is uncertain, fail closed.
    const composer = inputBox()
    if (!composer) return null
    const input = composer.getBoundingClientRect()
    const center = (input.left + input.right) / 2
    let best = null, score = 0
    for (const el of document.querySelectorAll('div, main, section')) {
      const cs = getComputedStyle(el)
      if (!/(auto|scroll)/.test(cs.overflowY) || !vis(el) || el.contains(composer)) continue
      const r = el.getBoundingClientRect()
      if (r.width < 220 || r.height < 80 || r.left > center || r.right < center || r.top >= input.top || r.bottom > input.bottom + 24) continue
      const overlap = Math.max(0, Math.min(r.right, input.right) - Math.max(r.left, input.left)) / Math.max(1, input.width)
      if (overlap < 0.65) continue
      const gap = Math.abs(input.top - r.bottom)
      const s = overlap * 1000 - gap - Math.abs(r.width - input.width) * 0.2
      if (s > score) { score = s; best = el }
    }
    return best
  }
  const media = (root) => [...root.querySelectorAll('img, video, source, a[href]')].map((el) => {
    const r = el.getBoundingClientRect()
    const src = el.currentSrc || el.src || el.href || el.getAttribute('src') || ''
    if (el.tagName === 'A' && !(/\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(src) || /\.(mp4|webm|mov|m4v)$/i.test(el.getAttribute('download') || ''))) return null
    if (!src || (el.tagName !== 'A' && (r.width < 60 || r.height < 60))) return null
    return { type: el.tagName === 'IMG' ? 'image' : 'video', src, poster: el.poster || null }
  }).filter(Boolean).filter((m, i, all) => all.findIndex((x) => x.src === m.src) === i)
  const buttons = (root) => [...root.querySelectorAll('button, [role="button"], a[href]')].filter(vis)
    .map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter((t) => t && t.length <= 40)

  if (op === 'info') {
    const box = inputBox()
    return { url: location.href, title: document.title, hasInput: !!box, busy: !!document.querySelector('[aria-label*="Stop" i], button[data-testid*="stop" i]') }
  }

  if (op === 'read') {
    const sc = scroller()
    if (!sc) return { url: location.href, messages: [], note: '未能确认聊天区域，请等待页面加载后刷新' }
    sc.scrollTop = sc.scrollHeight
    const box = sc.getBoundingClientRect()
    // 往下找到「每条消息」那一层：子节点多、且大多数有文字
    let list = sc
    for (let i = 0; i < 6; i++) {
      const kids = [...list.children].filter(vis)
      if (kids.length >= 3 || kids.length === 0) break
      list = kids.sort((a, b) => (b.innerText || '').length - (a.innerText || '').length)[0]
    }
    const limit = Math.max(1, Math.min(80, (args && args.limit) || 30))
    const kids = [...list.children].filter(vis).slice(-limit)
    const messages = kids.map((el) => {
      const r = el.getBoundingClientRect()
      // 找真正的气泡宽度：最深一层有文字的块
      let bubble = el
      while (bubble.children.length === 1 && (bubble.children[0].innerText || '').trim() === (bubble.innerText || '').trim()) bubble = bubble.children[0]
      const br = bubble.getBoundingClientRect()
      const mine = br.left > box.left + box.width * 0.3 && br.right > box.right - box.width * 0.15
      let text = (el.innerText || '').trim()
      if (/^You:\s*/.test(text)) { text = text.replace(/^You:\s*/, ''); return { role: 'me', text: text.slice(0, 8000), media: media(el), buttons: [] } }
      return { role: mine ? 'me' : 'muse', text: text.slice(0, 8000), media: media(el), buttons: buttons(el) }
    }).filter((m) => m.text || m.media.length)
    return { url: location.href, messages }
  }

  if (op === 'send' || op === 'forceSend') {
    const text = String((args && args.text) || '')
    const box = inputBox()
    if (!box) return { ok: false, error: '找不到输入框' }
    box.focus()
    if (box.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      setter.call(box, text)
      box.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      document.execCommand('selectAll', false)
      document.execCommand('insertText', false, text)
    }
    await new Promise((r) => setTimeout(r, 150))
    const scope = box.closest('form') || box.parentElement?.parentElement?.parentElement || document
    const send = [...scope.querySelectorAll('button, [role="button"]')].filter(vis).find((b) => /send|submit|发送/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('type') || '') + ' ' + (b.innerText || '')))
    if (send && !send.disabled) {
      const propKey = Object.keys(send).find(k => k.startsWith('__reactProps$'))
      const props = propKey ? send[propKey] : null
      if (props && typeof props.onClick === 'function') {
        props.onClick({ preventDefault: () => {}, stopPropagation: () => {} })
      } else {
        send.click()
      }
    } else {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }))
    }
    return { ok: true, via: send ? 'button' : 'enter' }
  }

  if (op === 'click') {
    const label = String((args && args.label) || '').trim().toLowerCase()
    const sc = scroller()
    if (!sc) return { ok: false, error: '未能确认聊天区域，未点击任何按钮' }
    const all = [...sc.querySelectorAll('button, [role="button"]')].filter(vis)
    const target = all.reverse().find((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase() === label)
    if (!target) return { ok: false, error: '没找到按钮：' + label }
    target.click()
    return { ok: true }
  }

  if (op === 'media') {
    // blob: 地址只在这个页面里有效：在页面里取出来转成 base64 交给手机
    const src = String((args && args.src) || '')
    if (!/^(blob:|https:)/.test(src)) return { ok: false, error: '不支持的地址' }
    const res = await fetch(src)
    if (!res.ok) return { ok: false, error: '视频请求失败 HTTP ' + res.status }
    const blob = await res.blob()
    if (blob.size > 60 * 1024 * 1024) return { ok: false, error: '文件太大（' + Math.round(blob.size / 1048576) + 'MB）' }
    const dataUrl = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(blob) })
    return { ok: true, type: blob.type, size: blob.size, dataUrl }
  }

  if (op === 'approve') return { ok: !!(window.__orbitApprove && window.__orbitApprove(args && args.mode === 'always' ? 'always' : 'once')) }

  if (op === 'autoContinue') {
    const box = inputBox()
    if (!box) return { ok: false, reason: 'no_input_box' }

    // 1. 检查是否正在生成中 (busy)：只检查是否有停止/中断按钮
    const stopBtn = document.querySelector('[aria-label*="Stop" i], button[data-testid*="stop" i]')
    if (stopBtn && vis(stopBtn)) return { ok: false, reason: 'busy' }

    // 2. 检查用户是否在最近 2 秒内正在键盘输入
    if (window.__orbitUserTyping && window.__orbitUserTyping()) {
      return { ok: false, reason: 'user_typing' }
    }

    // 3. 检查是否有继续/开工按钮（无论是在消息气泡内还是底部建议按钮）
    const sc = scroller() || document
    const candidateButtons = [...sc.querySelectorAll('button, [role="button"], a[role="button"]')].filter(vis)
    const continueBtn = candidateButtons.reverse().find((b) => {
      const text = (b.innerText || b.getAttribute('aria-label') || '').trim()
      return /^(继续|continue|继续生成|点击继续|收尾|全部开工|开工|第[一二三四五六七八九十\d]+批.*开工)$/i.test(text)
    })

    if (continueBtn) {
      const label = (continueBtn.innerText || continueBtn.getAttribute('aria-label') || '').trim()
      continueBtn.click()
      return { ok: true, action: 'clicked_button', label }
    }

    // 4. 如果没有按钮，检查最新一条 AI 消息是否在询问「继续」或「收尾」
    const kids = scroller() ? [...scroller().children].filter(vis) : []
    let lastMsgEl = null
    for (let i = kids.length - 1; i >= 0; i--) {
      const text = (kids[i].innerText || '').trim()
      if (text.length > 5) {
        lastMsgEl = kids[i]
        break
      }
    }

    if (lastMsgEl) {
      if (lastMsgEl.dataset.orbitContinueHandled) return { ok: false, reason: 'already_handled' }
      const text = (lastMsgEl.innerText || '').trim()
      const boxRect = scroller() ? scroller().getBoundingClientRect() : document.body.getBoundingClientRect()
      const br = lastMsgEl.getBoundingClientRect()
      const isMe = br.left > boxRect.left + boxRect.width * 0.3 && br.right > boxRect.right - boxRect.width * 0.15

      if (!isMe && !/^You:\s*/.test(text)) {
        const continuePromptRegex = /你说一声我就|你要我继续吗|需要我继续吗|回复[“"']?继续[”"']?|是否继续|还要继续吗|继续下一|确认后继续|如果你想继续|请确认是否继续|你说一声|需要继续请|如需继续|收尾/i
        if (continuePromptRegex.test(text)) {
          lastMsgEl.dataset.orbitContinueHandled = '1'
          const replyText = String((args && args.text) || '继续')
          box.focus()
          if (box.tagName === 'TEXTAREA') {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
            setter.call(box, replyText)
            box.dispatchEvent(new Event('input', { bubbles: true }))
          } else {
            document.execCommand('selectAll', false)
            document.execCommand('insertText', false, replyText)
          }
          await new Promise((r) => setTimeout(r, 150))
          const scope = box.closest('form') || box.parentElement?.parentElement?.parentElement || document
          const send = [...scope.querySelectorAll('button, [role="button"]')].filter(vis).find((b) => /send|submit|发送/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('type') || '') + ' ' + (b.innerText || '')))
          if (send && !send.disabled) send.click()
          else box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }))
          return { ok: true, action: 'sent_text', text: replyText, matched: text.slice(-60) }
        }
      }
    }

    return { ok: false, reason: 'no_continue_prompt' }
  }

  if (op === 'inspectMedia') {
    const allVideos = [...document.querySelectorAll('video')].map(v => ({
      src: v.src || v.currentSrc,
      poster: v.poster,
      duration: v.duration,
      w: v.videoWidth,
      h: v.videoHeight
    }));
    const allImages = [...document.querySelectorAll('img')].map(i => ({
      src: i.src,
      alt: i.alt,
      w: i.naturalWidth || i.width,
      h: i.naturalHeight || i.height
    })).filter(i => i.w > 100);
    const busy = !!document.querySelector('[aria-label*="Stop" i], button[data-testid*="stop" i]');
    const lastText = document.body.innerText.slice(-1000);
    return { busy, videos: allVideos, images: allImages, lastText };
  }

  if (op === 'downloadBlob') {
    const blobUrl = args && args.url;
    if (!blobUrl) return { ok: false, error: 'no url' };
    try {
      const blob = await fetch(blobUrl).then(r => r.blob());
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return { ok: true, dataUrl };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  if (op === 'attachImage') {
    const b64 = args && args.base64;
    const filename = (args && args.filename) || 'anchor.jpg';
    if (!b64) return { ok: false, error: 'no base64' };
    try {
      const byteCharacters = atob(b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      const file = new File([blob], filename, { type: 'image/jpeg' });
      const fileInput = document.querySelector('input[type="file"]');
      if (!fileInput) return { ok: false, error: 'no fileInput' };
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true, name: file.name, size: file.size };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  if (op === 'inspectFileInput') {
    const fileInput = document.querySelector('input[type="file"]');
    const attachBtn = [...document.querySelectorAll('button, [role="button"]')].find(b => /attach/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')));
    return {
      hasFileInput: !!fileInput,
      inputAccept: fileInput ? fileInput.accept : null,
      btnAria: attachBtn ? (attachBtn.getAttribute('aria-label') || attachBtn.innerText) : null
    };
  }

  if (op === 'inspectChat') {
    const stopEl = document.querySelector('[aria-label*="Stop" i], button[data-testid*="stop" i]');
    const composer = inputBox();
    const isStopVis = stopEl ? vis(stopEl) : false;
    const fileInputs = [...document.querySelectorAll('input[type="file"]')].map(i => ({ accept: i.accept, id: i.id, name: i.name }));
    const attachBtns = [...document.querySelectorAll('button, [role="button"]')].filter(b => vis(b) && /attach|upload|file|media|image/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || ''))).map(b => (b.getAttribute('aria-label') || b.innerText).trim());
    const bubbles = [...document.querySelectorAll('div, p, span, h1, h2, h3')]
      .filter(el => vis(el) && el.children.length === 0 && (el.innerText || '').trim().length > 0)
      .map(el => (el.innerText || '').trim());
    return {
      fileInputs,
      attachBtns,
      composerVal: composer ? (composer.value || composer.innerText) : null,
      allRecentText: bubbles.slice(-15)
    };
  }

  if (op === 'dump') {
    const out = []
    const walk = (el, depth) => {
      if (depth > ((args && args.depth) || 14) || out.length > 1500 || !vis(el)) return
      const id = [el.tagName.toLowerCase(), el.id ? '#' + el.id : '', el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : '', el.getAttribute('data-testid') ? '[testid=' + el.getAttribute('data-testid') + ']' : '', el.getAttribute('aria-label') ? '[aria=' + el.getAttribute('aria-label').slice(0, 30) + ']' : '', typeof el.className === 'string' && el.className ? '.' + el.className.split(/\s+/).slice(0, 3).join('.') : ''].join('')
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').slice(0, 60)
      const r = el.getBoundingClientRect()
      out.push('  '.repeat(depth) + id + ` @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}` + (own ? ' "' + own + '"' : ''))
      for (const c of el.children) walk(c, depth + 1)
    }
    walk(document.body, 0)
    return out.join('\n')
  }
  return { error: 'unknown op ' + op }
}
