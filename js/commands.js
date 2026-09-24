/**
 * Interpretador de comandos do VoiceTasks.
 *
 * Funções puras (sem DOM, sem estado): recebem texto livre, vindo do microfone
 * ou do campo de texto, e dizem qual ação executar. Por isso podem ser testadas
 * em Node sem navegador (ver tests/commands.test.js).
 */
(function (root) {
  "use strict";

  /** Minúsculas, sem acentos e sem espaços nas pontas: usado só para comparar. */
  function normalize(text) {
    return text
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  /** Remove pontuação que o reconhecimento de voz costuma pôr no fim da frase. */
  function stripEdgePunctuation(text) {
    return text.trim().replace(/^[\s"'“”.,!?;:]+|[\s"'“”.,!?;:]+$/g, "");
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  const CLEAR_COMMANDS = ["limpar tudo", "limpar todas", "apagar tudo"];

  /**
   * Converte o texto em um comando estruturado:
   * { type: "add", title } | { type: "complete", query } | { type: "remove", query }
   * | { type: "clear" } | { type: "empty" } | { type: "unknown" }
   *
   * As palavras-chave são comparadas sem diferenciar maiúsculas, mas o título
   * da tarefa preserva acentos e capitalização do que foi dito/digitado.
   */
  function parseCommand(rawText) {
    const text = stripEdgePunctuation(rawText || "");
    if (!text) return { type: "empty" };

    if (CLEAR_COMMANDS.includes(normalize(text))) return { type: "clear" };

    let match = text.match(/^adicionar\s+(.+)$/i);
    if (match) return { type: "add", title: capitalize(match[1].trim()) };

    match = text.match(/^(?:concluir|finalizar|marcar)\s+(.+?)(?:\s+como\s+(?:feita|conclu[ií]da))?$/i);
    if (match) return { type: "complete", query: match[1].trim() };

    match = text.match(/^(?:remover|apagar|excluir)\s+(.+)$/i);
    if (match) return { type: "remove", query: match[1].trim() };

    return { type: "unknown" };
  }

  /**
   * Encontra a tarefa que melhor corresponde à busca, ignorando acentos e
   * maiúsculas. Prioridade: título exato, depois correspondência parcial.
   * Com `preferPending`, tarefas ainda não concluídas vêm antes em cada nível.
   * Retorna o índice no array, ou -1.
   */
  function findTaskIndex(tasks, query, { preferPending = false } = {}) {
    const q = normalize(query);
    const candidates = [
      (t) => normalize(t.title) === q,
      (t) => normalize(t.title).includes(q),
    ];
    for (const matches of candidates) {
      if (preferPending) {
        const pendingIdx = tasks.findIndex((t) => !t.done && matches(t));
        if (pendingIdx !== -1) return pendingIdx;
      }
      const idx = tasks.findIndex(matches);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const api = { normalize, parseCommand, findTaskIndex };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.VoiceCommands = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
