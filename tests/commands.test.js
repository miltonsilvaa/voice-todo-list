const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCommand, findTaskIndex } = require("../js/commands.js");

test("adicionar: extrai o título preservando acentos e capitalizando", () => {
  assert.deepEqual(parseCommand("adicionar comprar pão"), { type: "add", title: "Comprar pão" });
  assert.deepEqual(parseCommand("Adicionar Reunião às 15h"), { type: "add", title: "Reunião às 15h" });
});

test("remove pontuação que o reconhecimento de voz coloca no fim", () => {
  assert.deepEqual(parseCommand("Adicionar comprar leite."), { type: "add", title: "Comprar leite" });
  assert.deepEqual(parseCommand("Limpar tudo."), { type: "clear" });
});

test("limpar: aceita variações, com ou sem acento/maiúscula", () => {
  for (const text of ["limpar tudo", "LIMPAR TODAS", "apagar tudo"]) {
    assert.deepEqual(parseCommand(text), { type: "clear" }, text);
  }
});

test("concluir: sinônimos e sufixo opcional \"como feita\"", () => {
  assert.deepEqual(parseCommand("concluir comprar leite"), { type: "complete", query: "comprar leite" });
  assert.deepEqual(parseCommand("finalizar relatório"), { type: "complete", query: "relatório" });
  assert.deepEqual(parseCommand("marcar comprar leite como feita"), { type: "complete", query: "comprar leite" });
  assert.deepEqual(parseCommand("marcar estudar como concluída"), { type: "complete", query: "estudar" });
});

test("remover: sinônimos", () => {
  for (const verb of ["remover", "apagar", "excluir"]) {
    assert.deepEqual(parseCommand(`${verb} estudar`), { type: "remove", query: "estudar" }, verb);
  }
});

test("entradas vazias e desconhecidas", () => {
  assert.deepEqual(parseCommand(""), { type: "empty" });
  assert.deepEqual(parseCommand("   ."), { type: "empty" });
  assert.deepEqual(parseCommand("xablau"), { type: "unknown" });
  assert.deepEqual(parseCommand("adicionar"), { type: "unknown" });
});

test("findTaskIndex: ignora acentos e maiúsculas", () => {
  const tasks = [{ title: "Comprar pão", done: false }];
  assert.equal(findTaskIndex(tasks, "comprar pao"), 0);
  assert.equal(findTaskIndex(tasks, "PÃO"), 0);
  assert.equal(findTaskIndex(tasks, "leite"), -1);
});

test("findTaskIndex: título exato vence correspondência parcial", () => {
  const tasks = [
    { title: "Estudar javascript", done: false },
    { title: "Estudar", done: false },
  ];
  assert.equal(findTaskIndex(tasks, "estudar"), 1);
});

test("findTaskIndex com preferPending: pula tarefas já concluídas", () => {
  const tasks = [
    { title: "Ligar para o banco", done: true },
    { title: "Ligar para a escola", done: false },
  ];
  assert.equal(findTaskIndex(tasks, "ligar", { preferPending: true }), 1);
  assert.equal(findTaskIndex(tasks, "ligar"), 0);
});
