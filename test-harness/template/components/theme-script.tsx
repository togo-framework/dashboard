// No-flash theme: same logic as nasaqThemeScript("dark") from @fadymondy/nasaq/web,
// inlined so the server layout does not import the client-only kit. Render it in <head>.
const script = `(function(){try{var p=localStorage.getItem("nasaq-theme")||"dark";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.dataset.theme=d?"dark":"light";e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
