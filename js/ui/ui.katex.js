// ui.katex.js
const CONFIG = {
  delimiters: [
    { left: "\\(", right: "\\)", display: false },
    { left: "\\[", right: "\\]", display: true },
    { left: "$$", right: "$$", display: true },
    { left: "$",  right: "$",  display: false }
  ],
  throwOnError: false,
  errorColor: '#cc0000',
  strict: false
};

export const UIKaTeX = {
  render(root = document.body) {
    if (typeof renderMathInElement === 'function') {
      renderMathInElement(root, CONFIG);
    }
  }
};
