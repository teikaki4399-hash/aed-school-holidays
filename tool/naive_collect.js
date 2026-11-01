// ================================================================
// 比較用：素朴な方法で年間行事予定表を探す（レポート 2.2節・4.2節）
//
// 使い方
//   1. Chrome で https://www.city-urayasu.ed.jp/ （学校一覧）を開く
//   2. 先に collect_schedules.js を実行し、window.__scheduleResults に結果がある状態にする
//      （ツールが見つけた表の URL を正解として使うため）
//   3. 開発者ツールのコンソールにこのファイルの中身を貼って Enter
//
// 方法
//   - 各校のトップページで、名前に「年間行事予定」「行事予定」を含むリンクだけをたどる
//   - リンク先が PDF ならそれを、ページならそのページにある PDF を候補とする
//   - ツールが見つけた表の PDF が候補に含まれていれば「見つけた」とする
// =============================================================
(async () => {
  const P = new DOMParser();
  const get = async (u) => P.parseFromString(await (await fetch(u)).text(), 'text/html');
  // 学校一覧から各校のホームページ（collect_schedules.js と同じ条件）
  const list = await get(location.href.split('#')[0]);
  const homes = new Map();
  for (const a of list.querySelectorAll('a[href]')) {
    const t = a.textContent.replace(/\s+/g, ' ').trim();
    if (/(小学校|中学校|義務教育学校)$/.test(t) && !/の(小|中)学校$|廃校|一覧|^市立(小|中)学校$|^(小|中)学校$/.test(t)
        && new URL(a.href).origin === location.origin && !homes.has(t)) homes.set(t, a.href.split('#')[0]);
  }
  const truth = new Map(window.__scheduleResults.filter((r) => r.結果 === '年間の表あり').map((r) => [r.学校, r.資料URL]));
  const out = [];
  for (const [name, home] of homes) {
    const d = await get(home);
    const ls = [...d.querySelectorAll('a[href]')]
      .map((a) => ({ t: a.textContent.replace(/\s+/g, ' ').trim(), u: a.href.split('#')[0] }))
      .filter((l) => /年間行事予定|行事予定/.test(l.t));
    const pdfs = [];
    for (const l of ls) {
      if (/\.pdf/i.test(l.u)) pdfs.push(l.u);
      else {
        try { pdfs.push(...[...(await get(l.u)).querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /\.pdf/i.test(h))); }
        catch (e) { /* 開けないページは飛ばす */ }
      }
    }
    const tu = truth.get(name);
    out.push({ 学校: name, 表あり: !!tu, 見つけた: !!tu && pdfs.includes(tu), リンク名: ls.map((l) => l.t).join(' / ') });
  }
  console.table(out);
  console.log('表あり', out.filter((o) => o.表あり).length, '見つけた', out.filter((o) => o.見つけた).length);
  window.__naive = out;
})();
