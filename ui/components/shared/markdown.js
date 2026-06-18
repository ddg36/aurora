function escape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderMarkdown(text) {
  const src = String(text || '');
  const bloques = [];
  let work = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const i = bloques.length;
    bloques.push(`<pre class="bg-black/40 rounded p-2 my-2 overflow-x-auto text-xs"><code>${escape(code)}</code></pre>`);
    return `\x01B${i}\x01`;
  });

  work = escape(work)
    .replace(/^###### (.*)$/gm, '<h6 class="font-semibold mt-2">$1</h6>')
    .replace(/^##### (.*)$/gm, '<h5 class="font-semibold mt-2">$1</h5>')
    .replace(/^#### (.*)$/gm, '<h4 class="font-semibold mt-2">$1</h4>')
    .replace(/^### (.*)$/gm, '<h3 class="font-semibold text-base mt-3">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 class="font-semibold text-lg mt-3">$1</h2>')
    .replace(/^# (.*)$/gm, '<h1 class="font-bold text-xl mt-3">$1</h1>')
    .replace(/^&gt; (.*)$/gm, '<blockquote class="border-l-2 border-white/20 pl-2 text-white/60 my-1">$1</blockquote>')
    .replace(/^[-*] (.*)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.*)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code class="bg-white/10 rounded px-1 text-[0.85em]">$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" class="underline text-sky-300">$1</a>')
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  return work.replace(/\x01B(\d+)\x01/g, (_, i) => bloques[Number(i)]);
}
