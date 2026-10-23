// crude html tokenizer: counts tags/attrs/text runs, returns checksum
export function tokenize(src: string): number {
  let i = 0;
  const n = src.length;
  let tags = 0;
  let attrs = 0;
  let text = 0;
  let h = 0;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c === 60) {
      i++;
      if (i < n && src.charCodeAt(i) === 47) i++;
      const start = i;
      while (i < n) {
        const d = src.charCodeAt(i);
        if (d === 32 || d === 62 || d === 47) break;
        i++;
      }
      const name = src.slice(start, i).toLowerCase();
      h = (h * 31 + name.length) | 0;
      tags++;
      while (i < n && src.charCodeAt(i) !== 62) {
        const d = src.charCodeAt(i);
        if (d === 61) attrs++;
        if (d === 34) {
          i++;
          const vs = i;
          while (i < n && src.charCodeAt(i) !== 34) i++;
          h = (h * 31 + (i - vs)) | 0;
        }
        i++;
      }
      i++;
    } else {
      const ts = i;
      while (i < n && src.charCodeAt(i) !== 60) i++;
      h = (h * 31 + (i - ts)) | 0;
      text++;
    }
  }
  return tags * 1000000 + attrs * 1000 + text + (h & 7);
}
