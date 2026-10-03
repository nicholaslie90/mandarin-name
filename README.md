# Name Lineage 字輩

Static page that suggests a child's Chinese name continuing a family's generational chain
(child's first given character = parent's last, by sound 諧音頂真 or by character 頂真),
shown in both Simplified (简) and Traditional (繁).

Live: https://mandarin-name.pages.dev

```sh
npm install
npm test     # checks character data against opencc-js + pinyin-pro, and the chain logic
npm run deploy
```

Character list: `public/chars.js`. Libraries are vendored in `public/vendor/` (copied from node_modules).
