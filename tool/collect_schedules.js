// ================================================================
// 学校の年間行事予定表を集めるツール（ブラウザで動かす版）
//
// 使い方
//   1. Chrome で，市教育委員会の「学校一覧」のページを開く
//      （例: https://www.city-urayasu.ed.jp/ ）
//   2. 開発者ツール（Mac: ⌥⌘J）のコンソールに，このファイルの中身を全部貼って Enter
//   3. 終わると表が表示され，結果の CSV がダウンロードされる
//
// 手順（report1023.md のアイディアと同じ）
//   - 学校一覧から各校のホームページに入る
//   - ホームページと，そこから1回のリンクで開けるページを確かめる
//   - 開いたページに「行事」「予定」「令和8年度」を含むリンクがあれば，その先も確かめる
//   - 名前にキーワードを含むリンク（PDF）を集め，「令和8年度」の印で今年度の表を選ぶ
//   - 学校ごとに「年間の表あり」「たよりのみ」「要確認」「資料なし」に分ける
//
// 制限
//   - ブラウザの決まりで，学校一覧と同じドメインにある学校のサイトしか読めない
//   - 画像だけのPDFや，年度の書かれていない表は「要確認」として人が確かめる
// =============================================================
(async () => {
  // ---------- 設定（キーワードはここだけを変える） ----------
  const CONFIG = {
    schoolLink: /(小学校|中学校|義務教育学校)$/,               // 学校一覧で学校とみなすリンク名
    notSchool: /の(小|中)学校$|廃校|一覧|^市立(小|中)学校$|^(小|中)学校$/, // 区ごとの見出しやメニューは学校にしない（v2で追加）
    keywords: /年間|行事|予定|計画|一覧|だより|便り|お知らせ/,   // 確かめるリンクの語
    deeper: /行事|予定|令和\s*8\s*年度/,                         // その先も確かめるリンクの語
    // 今年度の印（v2：「令和8年4月」「2026」も今年度とする）
    thisYear: /令和\s*[8８]\s*年|R\s*[8８](?![0-9])|2026/,
    otherYear: /令和\s*[1-7１-７]\s*年|平成|R\s*[1-7](?![0-9])|20(1\d|2[0-5])(?![0-9])/,
    annual: /年間|行事予定|行事計画|行事一覧|年間計画/,           // 年間の表とみなす語
    letter: /だより|便り|たより/,                                // 学校・学年だより
    exclude: /いじめ|PTA|ＰＴＡ|入学式|警報|欠席/,                // 予定表ではない資料（v2で追加）
    concurrency: 6,                                              // 同時に開くページ数
  };

  const parser = new DOMParser();
  const cache = new Map();
  // ページを取得して DOM にする（同じページは1回だけ取得）
  const getPage = async (url) => {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url, { credentials: 'omit' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => parser.parseFromString(t, 'text/html'))
      .catch(() => null);
    cache.set(url, p);
    return p;
  };
  // 同時に開くページ数を制限して順に処理する
  const pool = async (items, fn, n) => {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => {
      while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
    }));
    return out;
  };
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const links = (doc, base) => [...doc.querySelectorAll('a[href]')].map((a) => {
    let href = '';
    try { href = new URL(a.getAttribute('href'), base).href.split('#')[0]; } catch (e) { /* 無視 */ }
    return { text: clean(a.textContent), href };
  }).filter((l) => l.href.startsWith('http'));
  // ページの題名とパンくず（「現在位置」）を年度の判断に使う
  const pageContext = (doc) => {
    const body = clean(doc.body ? doc.body.textContent : '');
    const crumb = (body.match(/現在位置[：:]\s*(.{0,120}?)(ここから本文|$)/) || [])[1] || '';
    return clean(doc.title + ' ' + crumb);
  };
  const isPdf = (href) => /\.pdf(\?|$)/i.test(href);

  // ---------- 1. 学校一覧から各校のホームページを集める ----------
  const listUrl = location.href.split('#')[0];
  const listDoc = await getPage(listUrl);
  const schools = [];
  for (const l of links(listDoc, listUrl)) {
    if (CONFIG.schoolLink.test(l.text) && !CONFIG.notSchool.test(l.text) && l.href !== listUrl
        && new URL(l.href).origin === location.origin
        && !schools.find((s) => s.home === l.href)) {
      schools.push({ name: l.text, home: l.href });
    }
  }
  console.log(`学校 ${schools.length} 校を確かめます`);

  // 学校一覧のリンク先が学校のホームページではなく，市の施設案内ページの場合がある（例：船橋市）．
  // そのときは，「ホームページ」と書かれたリンクか，学校名と同じ名前のリンクを2回までたどる．
  const resolveHome = async (school) => {
    const short = school.name.replace(/学校$/, '');            // 例: 船橋小学校 → 船橋小
    const seen = new Set();
    let url = school.home;
    for (let hop = 0; hop < 3; hop++) {
      seen.add(url);
      const doc = await getPage(url);
      if (!doc) break;
      const ls = links(doc, url).filter((l) => new URL(l.href).origin === location.origin);
      // 「〇〇小学校ホームページはこちら」のようなリンクがあれば，その先がホームページ
      const hp = ls.find((l) => /ホームページ/.test(l.text) && l.text.includes(short));
      if (hp) return hp.href;
      // なければ，学校名と同じ名前のリンク（施設案内の詳しいページ）を1つたどる
      const next = ls.find((l) => l.text === school.name && !seen.has(l.href));
      if (!next) break;
      url = next.href;
    }
    return school.home;                                         // 見つからなければ一覧のリンク先をそのまま使う
  };
  for (const s of schools) s.home = await resolveHome(s);

  // ---------- 2. 各校について手順どおりにたどる ----------
  const checkSchool = async (school) => {
    // 学校のサイトの範囲（…/mtd-1-j のように最後が「/」でもファイル名でもないURLは，その下を範囲にする）
    const last = school.home.split('/').pop();
    const prefix = (last && !last.includes('.')) ? school.home + '/' : school.home.replace(/[^/]*$/, '');
    const inSite = (h) => h.startsWith(prefix) && !isPdf(h);
    const visited = new Map();                                   // URL → 段階
    const found = [];                                            // 見つかった資料

    const visit = async (url, depth) => {
      if (visited.has(url)) return [];
      visited.set(url, depth);
      const doc = await getPage(url);
      if (!doc || !doc.body) return [];
      const ctx = pageContext(doc);
      const ls = links(doc, url);
      // このページにある，キーワードを含む PDF を記録する
      for (const l of ls) {
        if (isPdf(l.href) && (CONFIG.keywords.test(l.text) || CONFIG.keywords.test(ctx))) {
          found.push({ text: l.text, href: l.href, page: url, ctx, depth });
        }
      }
      // 年間の表がPDFでなくページの本文にある場合も記録する
      if (CONFIG.annual.test(doc.title) && !ls.some((l) => isPdf(l.href))) {
        found.push({ text: clean(doc.title), href: url, page: url, ctx, depth, htmlOnly: true });
      }
      return ls;
    };

    // 段階0: ホームページ
    const homeLinks = await visit(school.home, 0);
    // 段階1: ホームページから1回のリンクで開けるページ（すべて）
    const lv1 = [...new Set(homeLinks.filter((l) => inSite(l.href)).map((l) => l.href))];
    const lv1Links = await pool(lv1, (u) => visit(u, 1), CONFIG.concurrency);
    // 段階2: 段階1のページにある「行事」「予定」「令和8年度」を含むリンクの先
    const lv2 = [...new Set(lv1Links.flat()
      .filter((l) => inSite(l.href) && CONFIG.deeper.test(l.text)).map((l) => l.href))];
    await pool(lv2, (u) => visit(u, 2), CONFIG.concurrency);

    // ---------- 3. 今年度かどうかと種類を判断する ----------
    const judged = found.filter((f) => !CONFIG.exclude.test(f.text + ' ' + f.ctx)).map((f) => {
      let year = '不明';
      // ファイル名（例: R8gyoujinenkan.pdf）も年度の手がかりにする（v2で追加）
      const file = decodeURIComponent(f.href.split('/').pop() || '').replace(/[_\-.]/g, ' ');
      const fileThis = /(^|[^a-z0-9])r\s*0?8(?![0-9])|2026/i.test(file);
      const fileOther = /(^|[^a-z0-9])r\s*0?[1-7](?![0-9])|20(1\d|2[0-5])/i.test(file);
      if (CONFIG.thisYear.test(f.text)) year = '今年度';
      else if (CONFIG.otherYear.test(f.text)) year = '過去';
      else if (fileThis && !fileOther) year = '今年度';
      else if (fileOther && !fileThis) year = '過去';
      else if (CONFIG.thisYear.test(f.ctx) && !CONFIG.otherYear.test(f.ctx)) year = '今年度';
      else if (CONFIG.otherYear.test(f.ctx)) year = '過去';
      const both = f.text + ' ' + f.ctx;
      const kind = CONFIG.letter.test(f.text) ? 'たより'
        : CONFIG.annual.test(f.text) ? '年間'
        : CONFIG.letter.test(both) ? 'たより'
        : CONFIG.annual.test(both) ? '年間' : 'その他';
      return { ...f, year, kind };
    });
    const pick = (cond) => judged.filter(cond);
    const annualNow = pick((f) => f.kind === '年間' && f.year === '今年度' && !f.htmlOnly);
    const letterNow = pick((f) => f.kind === 'たより' && f.year === '今年度');
    const unsure = pick((f) => f.kind !== 'その他' && (f.year === '不明' || f.htmlOnly) && f.year !== '過去');
    let result = '資料なし';
    if (annualNow.length) result = '年間の表あり';
    else if (letterNow.length) result = 'たよりのみ';
    else if (unsure.length) result = '要確認';
    const best = annualNow[0] || letterNow[0] || unsure[0] || null;
    return {
      学校: school.name,
      結果: result,
      資料名: best ? best.text : '',
      資料URL: best ? best.href : '',
      見つけたページ: best ? best.page : '',
      段階: best ? best.depth : '',
      開いたページ数: visited.size,
    };
  };

  const results = await pool(schools, checkSchool, 2);
  console.table(results);
  const count = {};
  results.forEach((r) => { count[r.結果] = (count[r.結果] || 0) + 1; });
  console.log('集計', count);

  // ---------- 4. 結果を CSV で保存する ----------
  const cols = Object.keys(results[0] || {});
  const csv = '﻿' + [cols.join(',')].concat(results.map((r) =>
    cols.map((c) => `"${String(r[c]).replace(/"/g, '""')}"`).join(','))).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `schedules_${location.hostname}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  window.__scheduleResults = results;
  return results;
})();
