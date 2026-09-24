(() => {
  "use strict";

  const STORAGE_KEY = "voice-todo-tasks";

  const micBtn = document.getElementById("micBtn");
  const micStatus = document.getElementById("micStatus");
  const fallbackForm = document.getElementById("fallbackForm");
  const fallbackInput = document.getElementById("fallbackInput");
  const feedbackLog = document.getElementById("feedbackLog");
  const tasksList = document.getElementById("tasksList");
  const tasksCount = document.getElementById("tasksCount");
  const emptyState = document.getElementById("emptyState");

  /* ===== Estado ===== */
  function loadTasks() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  let tasks = loadTasks();

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // Sem localStorage (modo privado/cota cheia): o app segue funcionando em memória.
    }
  }

  function render() {
    saveTasks();
    emptyState.hidden = tasks.length > 0;
    tasksList.innerHTML = tasks
      .map((task) => {
        const title = escapeHtml(task.title);
        return `
      <li class="task-item ${task.done ? "is-done" : ""}" data-id="${escapeHtml(String(task.id))}">
        <button class="task-item__check" data-action="toggle" aria-pressed="${task.done}" aria-label="Concluída: ${title}">${task.done ? "✓" : ""}</button>
        <span class="task-item__title">${title}</span>
        <button class="task-item__delete" data-action="delete" aria-label="Excluir tarefa: ${title}">×</button>
      </li>`;
      })
      .join("");
    const pending = tasks.filter((t) => !t.done).length;
    tasksCount.textContent = `${pending} pendente${pending === 1 ? "" : "s"}`;
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  tasksList.addEventListener("click", (event) => {
    const item = event.target.closest(".task-item");
    if (!item) return;
    const id = item.dataset.id;
    const action = event.target.closest("[data-action]")?.dataset.action;

    if (action === "toggle") {
      const task = tasks.find((t) => t.id === id);
      if (task) task.done = !task.done;
      render();
    }
    if (action === "delete") {
      tasks = tasks.filter((t) => t.id !== id);
      render();
    }
  });

  /* ===== Execução dos comandos (o parsing fica em js/commands.js) ===== */
  const { parseCommand, findTaskIndex } = window.VoiceCommands;

  /**
   * Interpreta um comando em texto livre e executa a ação correspondente.
   * Retorna { success: boolean, message: string } para dar feedback ao usuário.
   */
  function parseAndExecute(rawText) {
    const command = parseCommand(rawText);

    switch (command.type) {
      case "empty":
        return { success: false, message: "Não entendi, tente novamente." };

      case "clear":
        tasks = [];
        render();
        return { success: true, message: "Todas as tarefas foram removidas." };

      case "add":
        tasks.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: command.title, done: false });
        render();
        return { success: true, message: `Tarefa adicionada: "${command.title}".` };

      case "complete": {
        const idx = findTaskIndex(tasks, command.query, { preferPending: true });
        if (idx === -1) {
          return { success: false, message: `Nenhuma tarefa encontrada com "${command.query}".` };
        }
        if (tasks[idx].done) {
          return { success: true, message: `A tarefa "${tasks[idx].title}" já estava concluída.` };
        }
        tasks[idx].done = true;
        render();
        return { success: true, message: `Tarefa concluída: "${tasks[idx].title}".` };
      }

      case "remove": {
        const idx = findTaskIndex(tasks, command.query);
        if (idx === -1) {
          return { success: false, message: `Nenhuma tarefa encontrada com "${command.query}".` };
        }
        const [removed] = tasks.splice(idx, 1);
        render();
        return { success: true, message: `Tarefa removida: "${removed.title}".` };
      }

      default:
        return {
          success: false,
          message: `Comando não reconhecido: "${rawText.trim()}". Tente "adicionar ...", "concluir ...", "remover ..." ou "limpar tudo".`,
        };
    }
  }

  function logFeedback(result) {
    const item = document.createElement("div");
    item.className = `feedback-item ${result.success ? "is-success" : "is-error"}`;
    item.textContent = result.message;
    feedbackLog.prepend(item);
    while (feedbackLog.children.length > 4) {
      feedbackLog.removeChild(feedbackLog.lastChild);
    }
    speak(result.message);
  }

  /* ===== Fallback de texto (usa exatamente o mesmo parser) ===== */
  fallbackForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = fallbackInput.value.trim();
    if (!text) return;
    const result = parseAndExecute(text);
    logFeedback(result);
    fallbackForm.reset();
  });

  /* ===== Web Speech API: Síntese de voz (feedback falado) ===== */
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel(); // não enfileira falas antigas
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Síntese de voz é apenas um extra — falha silenciosamente se não suportado.
    }
  }

  /* ===== Web Speech API: Reconhecimento de voz ===== */
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;

  const RECOGNITION_ERRORS = {
    "not-allowed": "Acesso ao microfone negado. Libere a permissão no navegador ou use o campo de texto abaixo.",
    "service-not-allowed": "Reconhecimento de voz indisponível nesta página (é preciso abrir via https). Use o campo de texto abaixo.",
    "no-speech": "Não ouvi nada. Clique no microfone e tente de novo.",
    "audio-capture": "Nenhum microfone encontrado. Use o campo de texto abaixo.",
    network: "Falha de rede no reconhecimento de voz. Use o campo de texto abaixo.",
  };

  function setListening(listening) {
    isListening = listening;
    micBtn.classList.toggle("is-listening", listening);
    micBtn.setAttribute("aria-pressed", String(listening));
    micBtn.setAttribute("aria-label", listening ? "Parar de ouvir" : "Ativar microfone");
  }

  if (SpeechRecognitionAPI) {
    recognition = new SpeechRecognitionAPI();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener("start", () => {
      setListening(true);
      micStatus.textContent = "Ouvindo... fale um comando.";
    });

    recognition.addEventListener("result", (event) => {
      const transcript = event.results[0][0].transcript;
      micStatus.textContent = `Você disse: "${transcript}"`;
      const result = parseAndExecute(transcript);
      logFeedback(result);
    });

    recognition.addEventListener("error", (event) => {
      if (event.error === "aborted") return;
      micStatus.textContent =
        RECOGNITION_ERRORS[event.error] || `Erro no reconhecimento de voz (${event.error}). Use o campo de texto abaixo.`;
    });

    recognition.addEventListener("end", () => setListening(false));

    micBtn.addEventListener("click", () => {
      if (isListening) {
        recognition.stop();
        return;
      }
      try {
        window.speechSynthesis?.cancel(); // evita o microfone captar a própria fala do app
        recognition.start();
      } catch {
        micStatus.textContent = "Não foi possível iniciar o microfone. Verifique as permissões.";
      }
    });
  } else {
    micBtn.disabled = true;
    micStatus.textContent =
      "Seu navegador não suporta reconhecimento de voz (Web Speech API). Use o campo de texto abaixo — ele usa exatamente a mesma lógica de comandos.";
  }

  render();
})();
