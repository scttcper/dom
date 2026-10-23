// `compressToEncodedURIComponent` from lz-string 1.5.0 (MIT, Copyright (c) 2013 Pieroxy),
// restructured (bit writer helper, Map dictionaries) with identical output.
// https://github.com/pieroxy/lz-string/blob/master/libs/lz-string.js
// Used by `screen.logTestingPlaygroundURL`.

const keyStrUriSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
const BITS_PER_CHAR = 6;

class BitWriter {
  out: string[] = [];
  val = 0;
  pos = 0;

  /** Write the low `n` bits of `value`, least significant bit first. */
  write(value: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.val = (this.val << 1) | (value & 1);
      if (this.pos === BITS_PER_CHAR - 1) {
        this.pos = 0;
        this.out.push(keyStrUriSafe.charAt(this.val));
        this.val = 0;
      } else {
        this.pos++;
      }
      value >>= 1;
    }
  }

  flush(): string {
    for (;;) {
      this.val <<= 1;
      if (this.pos === BITS_PER_CHAR - 1) {
        this.out.push(keyStrUriSafe.charAt(this.val));
        break;
      }
      this.pos++;
    }
    return this.out.join("");
  }
}

export function compressToEncodedURIComponent(uncompressed: string | null | undefined): string {
  if (uncompressed == null) return "";
  const dictionary = new Map<string, number>();
  const toCreate = new Set<string>();
  const w8 = new BitWriter();
  let w = "";
  let enlargeIn = 2; // Compensate for the first entry which should not count
  let dictSize = 3;
  let numBits = 2;

  const emit = (word: string) => {
    if (toCreate.has(word)) {
      const code = word.charCodeAt(0);
      if (code < 256) {
        w8.write(0, numBits);
        w8.write(code, 8);
      } else {
        w8.write(1, numBits);
        w8.write(code, 16);
      }
      enlargeIn--;
      if (enlargeIn === 0) {
        enlargeIn = Math.pow(2, numBits);
        numBits++;
      }
      toCreate.delete(word);
    } else {
      w8.write(dictionary.get(word)!, numBits);
    }
    enlargeIn--;
    if (enlargeIn === 0) {
      enlargeIn = Math.pow(2, numBits);
      numBits++;
    }
  };

  for (let ii = 0; ii < uncompressed.length; ii++) {
    const c = uncompressed.charAt(ii);
    if (!dictionary.has(c)) {
      dictionary.set(c, dictSize++);
      toCreate.add(c);
    }
    const wc = w + c;
    if (dictionary.has(wc)) {
      w = wc;
    } else {
      emit(w);
      // Add wc to the dictionary.
      dictionary.set(wc, dictSize++);
      w = c;
    }
  }

  // Output the code for w.
  if (w !== "") emit(w);

  // Mark the end of the stream
  w8.write(2, numBits);
  return w8.flush();
}
