const fs = require('fs');

console.log('--- AFLAM18.MEDIA ---');
const p1 = fs.readFileSync('/tmp/page1.html', 'utf8');

// Check script blocks containing servers or video or ajax
const scripts1 = [...p1.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
for (let i = 0; i < scripts1.length; i++) {
  const s = scripts1[i];
  if (/server|player|video|source|embed|ajax/i.test(s) && s.length < 5000) {
    console.log(`Script ${i} length ${s.length}:`, s.substring(0, 300));
  }
}

// Search for links or buttons
const links1 = [...p1.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi)];
const watchLinks1 = links1.filter(l => /سيرفر|مشاهدة|تحميل|server|watch|download|جودة/i.test(l[0]));
console.log('Watch links in p1 count:', watchLinks1.length);
watchLinks1.slice(0, 15).forEach(l => console.log('Link:', l[1], 'Text:', l[2].trim().replace(/\s+/g, ' ')));

console.log('--- AFLAMICOSE.COM ---');
const p2 = fs.readFileSync('/tmp/page2.html', 'utf8');
const links2 = [...p2.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi)];
const watchLinks2 = links2.filter(l => /سيرفر|مشاهدة|تحميل|server|watch|download|جودة|player/i.test(l[0]));
console.log('Watch links in p2 count:', watchLinks2.length);
watchLinks2.slice(0, 15).forEach(l => console.log('Link:', l[1], 'Text:', l[2].trim().replace(/\s+/g, ' ')));

// Check watch-player section in p2
const watchPlayerIdx = p2.indexOf('watch-player');
if (watchPlayerIdx !== -1) {
  console.log('p2 watch-player context:', p2.substring(watchPlayerIdx - 200, watchPlayerIdx + 800));
}
