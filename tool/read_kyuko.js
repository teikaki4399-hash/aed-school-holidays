// ================================================================
// 年間行事予定表（PDF）から休校の日付を、表の中の文字の位置で取り出す
//
// 使い方
//   1. Chrome で https://www.city-urayasu.ed.jp/ を開く（PDF と同じドメインにするため）
//   2. 開発者ツールのコンソールにこのファイルの中身を貼って Enter
//   3. 結果が表で表示され、window.__kyuko に入る
//
// 手順
//   - pdf.js で文字とその位置（x, y）を取り出す
//   - 「4月」のような月の見出しが3つ以上並ぶ行を、見出しの行とする
//   - 「振替休業」「臨時休業」「代休」などの文字ごとに、
//       同じ行で左にある日の数字・曜日から、その欄の左端を決める
//       → 欄の中央に最も近い月の見出しを、その欄の月とする
//       → 同じ欄の左にある数字（なければ表の左端の数字）を日とする
//       → 欄に「5月18日」のような日付があれば、それを使う
//   - 同じ行の曜日と、求めた日付の曜日が合う数字を優先する
//   - 国の祝日の「振替休日」は対象外
// =============================================================
(async () => {
  const B = 'https://www.city-urayasu.ed.jp/_res/projects/school/_page_/';
  const S = [['北部小','003/001/032/reiwa8.pdf'],['富岡小','003/001/085/r8gyoujiyotei.pdf'],['舞浜小','003/006/101/8nennkann.pdf'],['美浜北小','003/020/901/nenkan.pdf'],['日の出小','003/025/937/nennkanngyouji.pdf'],['日の出南小','003/001/230/r8nenkan.pdf'],['明海南小','003/001/238/r8nenkangyoujiyotei.pdf'],['高洲北小','003/001/246/8.pdf'],['東野小','003/025/645/r8_gyouji.pdf'],['入船小','003/025/711/r8gyouziyotei.pdf'],['東小','003/025/712/1.pdf'],['浦安中','003/025/665/r8gyoujiyotei0325.pdf'],['堀江中','003/001/308/11.pdf'],['富岡中','003/001/336/08nen.pdf'],['美浜中','003/001/349/r8gyoujiyotei.pdf'],['日の出中','003/001/771/r8nenkangyouji01.pdf'],['明海中','003/012/308/nennkannr8.pdf'],['高洲中','003/001/792/26.pdf']];
  const load = (src) => new Promise((ok, ng) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ng; document.head.appendChild(s); });
  if (!window.pdfjsLib) {
    await load('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const WD = '日月火水木金土';
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 60; };
  const KW = /振替|臨時休業|休校|振休|代休/;
  const out = [];
  for (const [name, path] of S) {
    const doc = await pdfjsLib.getDocument({ url: B + path }).promise;
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p); const vp = pg.getViewport({ scale: 1 }); const tc = await pg.getTextContent();
      const it = tc.items.filter((i) => i.str.trim()).map((i) => ({ s: i.str.normalize('NFKC').trim(), x: i.transform[4], y: vp.height - i.transform[5], w: i.width }));
      // 月の見出し（「4月」または「4」「月」）
      const heads = [];
      for (const i of it) {
        const m = i.s.match(/^(1[0-2]|[1-9])\s*月$/);
        if (m) heads.push({ m: +m[1], x: i.x, y: i.y, w: i.w });
        else if (/^(1[0-2]|[1-9])$/.test(i.s)) {
          const nx = it.find((j) => j !== i && j.s === '月' && Math.abs(j.y - i.y) < 2 && j.x > i.x && j.x - i.x < i.w + 6);
          if (nx) heads.push({ m: +i.s, x: i.x, y: i.y, w: nx.x + nx.w - i.x });
        }
      }
      const bands = [];
      heads.slice().sort((a, b) => a.y - b.y).forEach((h) => { const b = bands.find((b) => Math.abs(b.y - h.y) < 6); if (b) b.hs.push(h); else bands.push({ y: h.y, hs: [h] }); });
      const hrows = bands.filter((b) => b.hs.length >= 3);
      const nums = it.filter((i) => /^([1-9]|[12][0-9]|3[01])$/.test(i.s)).map((i) => ({ ...i, v: +i.s }));
      const minNumX = Math.min(...nums.map((n) => n.x));
      const expl = it.map((i) => ({ ...i, mm: i.s.match(/^(1[0-2]|[1-9])月([1-9]|[12][0-9]|3[01])日$/) })).filter((i) => i.mm);
      const wds = it.filter((i) => /^[日月火水木金土]$/.test(i.s));
      for (const k of it) {
        if (!KW.test(k.s) || k.s === '振替休日') continue;
        let m = null, d = null;
        const ex = expl.filter((e) => e.x < k.x + 2 && Math.abs(e.y - k.y) < 9).sort((a, b) => b.x - a.x);
        if (ex.length) { m = +ex[0].mm[1]; d = +ex[0].mm[2]; }
        else {
          const band = hrows.filter((b) => b.y < k.y - 1).sort((a, b) => b.y - a.y)[0];
          if (band) {
            const row = band.hs.slice().sort((a, b) => a.x - b.x);
            const colw = med(row.map((h, i, a) => (i ? h.x - a[i - 1].x : null)).filter((v) => v));
            const marks = [...nums, ...wds].filter((n) => Math.abs(n.y - k.y) < 10 && n.x < k.x && k.x - n.x < colw * 0.9).sort((a, b) => b.x - a.x);
            const xc = marks.length ? Math.min(...marks.filter((n) => marks[0].x - n.x < colw * 0.35).map((n) => n.x)) : k.x - 5;
            let hc = row.filter((h) => { const c = h.x + h.w / 2; return c >= xc - 0.3 * colw && c <= xc + 1.2 * colw; })
              .sort((a, b) => Math.abs(a.x + a.w / 2 - (xc + colw / 2)) - Math.abs(b.x + b.w / 2 - (xc + colw / 2)))[0];
            if (!hc) hc = row.filter((h) => h.x <= k.x + colw * 0.25).sort((a, b) => b.x - a.x)[0];
            if (hc) {
              m = hc.m; const y = m >= 4 ? 2026 : 2027;
              const inCol = (n) => n.x >= xc - 0.3 * colw && n.x < k.x;
              const w = wds.filter((w) => inCol(w) && Math.abs(w.y - k.y) < 12).sort((a, b) => Math.abs(a.y - k.y) - Math.abs(b.y - k.y))[0];
              const c1 = nums.filter((n) => inCol(n) && Math.abs(n.y - k.y) < 12).sort((a, b) => Math.abs(a.y - k.y) - Math.abs(b.y - k.y));
              const c2 = nums.filter((n) => n.x < minNumX + 15 && Math.abs(n.y - k.y) < 12).sort((a, b) => Math.abs(a.y - k.y) - Math.abs(b.y - k.y));
              const cands = [...c1, ...c2];
              const ok = (c) => { const dt = new Date(y, m - 1, c.v); return dt.getMonth() === m - 1 && (!w || w.s === WD[dt.getDay()]); };
              const pick = cands.find(ok) || cands[0];
              if (pick) d = pick.v;
            }
          }
        }
        let date = '';
        if (m && d) { const y = m >= 4 ? 2026 : 2027; date = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
        out.push({ 学校: name, ページ: p, 表の文字: k.s, 日付: date });
      }
    }
  }
  console.table(out);
  window.__kyuko = out;
})();
