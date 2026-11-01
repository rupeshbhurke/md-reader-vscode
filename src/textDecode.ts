/**
 * Decodes the raw bytes of a Markdown file read straight from disk (the reader
 * no longer needs the file open in an editor, so it can't ask VS Code's
 * TextDocument for the text). Pure — no `vscode` import — so it is unit-tested.
 *
 * `ok: false` means "don't trust this decode": the bytes look like UTF-16
 * (byte-order mark) or contain invalid UTF-8. The caller then falls back to
 * `vscode.workspace.openTextDocument`, which understands VS Code's encoding
 * detection.
 */
export function decodeText(bytes: Uint8Array): { text: string; ok: boolean } {
  // UTF-16 LE / BE byte-order marks.
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    return { text: '', ok: false };
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { text: '', ok: false };
  }
  // Drop a UTF-8 byte-order mark so it can't defeat front-matter detection (`---` must be first).
  if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); }
  return { text, ok: true };
}
