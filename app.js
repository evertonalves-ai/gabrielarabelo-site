(() => {
  "use strict";

  // Chave publicável: só permite INSERT na tabela leads_gabriela (RLS + grants por coluna).
  const SUPABASE_URL = "https://yapabpulmdcbfwwntpen.supabase.co";
  const SUPABASE_KEY = "sb_publishable_iSTST0HwhCB1hXAUYZj-yA_1dl6dbxt";
  const TABELA = "leads_gabriela";

  // Quando tiver o número da Gabriela (só dígitos, com DDI: 5534999999999),
  // preencha aqui e o WhatsApp abre com a mensagem já escrita.
  const WHATSAPP_NUMERO = "";
  const WHATSAPP_LINK = "https://whats.link/gabrielarabelobeauty1";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  $("#ano").textContent = new Date().getFullYear();

  // Menu mobile
  const toggle = $("#menuToggle");
  const menu = $("#menu");
  toggle.addEventListener("click", () => {
    const aberto = menu.classList.toggle("aberto");
    toggle.setAttribute("aria-expanded", String(aberto));
  });
  $$("#menu a").forEach(a => a.addEventListener("click", () => {
    menu.classList.remove("aberto");
    toggle.setAttribute("aria-expanded", "false");
  }));

  // Entrada suave das seções
  const alvos = $$(".card, .sobre, .passos li, .agendar, .contato, .hero__texto");
  alvos.forEach(el => el.classList.add("revelar"));
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(entradas => {
      entradas.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("visivel"); io.unobserve(e.target); }
      });
    }, { threshold: .12 });
    alvos.forEach(el => io.observe(el));
  } else {
    alvos.forEach(el => el.classList.add("visivel"));
  }

  // "Saiba mais"
  const detalhes = {
    corporal: {
      titulo: "Harmonização corporal com placas",
      corpo: `<p>Protocolo de estética corporal para trabalhar o contorno e a definição de regiões como abdômen, flancos, culote, glúteos e braços.</p>
        <ul><li>Indicado para quem quer melhorar o contorno corporal</li><li>Número de sessões definido na avaliação</li><li>Pode ser combinado com ativação de colágeno</li></ul>`,
      proc: "Harmonização corporal com placas"
    },
    facial: {
      titulo: "Harmonização facial com placas",
      corpo: `<p>Cuidado com o contorno do rosto, região da papada e sustentação da pele, respeitando os traços de cada pessoa.</p>
        <ul><li>Resultado natural, sem mudar quem você é</li><li>Protocolo montado depois da avaliação</li></ul>`,
      proc: "Harmonização facial com placas"
    },
    colageno: {
      titulo: "Ativação de colágeno",
      corpo: `<p>Com o tempo o corpo produz menos colágeno, e a pele perde firmeza. Os protocolos de ativação estimulam essa produção para melhorar textura, firmeza e flacidez.</p>
        <ul><li>Pode ser feito no rosto e no corpo</li><li>Resultado progressivo, ao longo das sessões</li></ul>`,
      proc: "Ativação de colágeno"
    },
    avaliacao: {
      titulo: "Avaliação facial e corporal",
      corpo: `<p>É o primeiro passo de qualquer tratamento. Conversamos sobre o que te incomoda, eu avalio a área e explico quais protocolos fazem sentido, quantas sessões e quanto custa.</p>
        <p>Você sai com um plano claro e decide com calma.</p>`,
      proc: "Avaliação (ainda não sei)"
    }
  };
  const modal = $("#modal");
  let procModal = "";
  $$("[data-saiba]").forEach(btn => btn.addEventListener("click", () => {
    const d = detalhes[btn.dataset.saiba];
    $("#modalTitulo").textContent = d.titulo;
    $("#modalCorpo").innerHTML = d.corpo; // conteúdo estático, definido acima
    procModal = d.proc;
    modal.showModal();
  }));
  $("#modalFechar").addEventListener("click", () => modal.close());
  modal.addEventListener("click", e => { if (e.target === modal) modal.close(); });
  $("#modalCta").addEventListener("click", () => { modal.close(); escolherProcedimento(procModal); });

  // "Falar com a especialista" já marca o procedimento no formulário
  const selectProc = $("#procedimento");
  function escolherProcedimento(nome) {
    if (!nome) return;
    selectProc.value = nome;
    setTimeout(() => $("#nome").focus({ preventScroll: true }), 600);
  }
  $$("[data-proc]").forEach(a => a.addEventListener("click", () => escolherProcedimento(a.dataset.proc)));

  // Máscara de telefone
  const tel = $("#whatsapp");
  tel.addEventListener("input", () => {
    const d = tel.value.replace(/\D/g, "").slice(0, 11);
    let v = d;
    if (d.length > 2) v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 7) v = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
    tel.value = v;
  });

  // Formulário
  const form = $("#formLead");
  const status = $("#formStatus");
  const btn = $("#btnEnviar");

  function marcarErro(campo, msg) {
    const el = $(`[data-erro="${campo}"]`);
    el.textContent = msg || "";
    const input = form.elements[campo];
    if (input && input.type !== "checkbox") input.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  function validar(dados) {
    let ok = true;
    const nome = dados.nome.trim();
    if (nome.length < 2 || nome.length > 80) { marcarErro("nome", "Digite seu nome."); ok = false; } else marcarErro("nome");
    if (!/^\d{10,11}$/.test(dados.whatsapp)) { marcarErro("whatsapp", "Digite um WhatsApp com DDD."); ok = false; } else marcarErro("whatsapp");
    if (!dados.procedimento) { marcarErro("procedimento", "Escolha uma opção."); ok = false; } else marcarErro("procedimento");
    if (!dados.consentimento) { marcarErro("consentimento", "Preciso da sua autorização para entrar em contato."); ok = false; } else marcarErro("consentimento");
    return ok;
  }

  function linkWhatsApp(msg) {
    return WHATSAPP_NUMERO
      ? `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msg)}`
      : WHATSAPP_LINK;
  }

  async function salvarLead(dados) {
    const params = new URLSearchParams(location.search);
    const origem = (params.get("utm_source") || document.referrer || "direto").slice(0, 120);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABELA}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        nome: dados.nome.trim(),
        whatsapp: "55" + dados.whatsapp,
        procedimento: dados.procedimento,
        origem,
        consentimento: true
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (form.elements.empresa.value) return; // bot

    const dados = {
      nome: form.elements.nome.value,
      whatsapp: tel.value.replace(/\D/g, ""),
      procedimento: selectProc.value,
      consentimento: form.elements.consentimento.checked
    };
    if (!validar(dados)) { status.className = "form__status falha"; status.textContent = "Confira os campos destacados."; return; }

    btn.disabled = true;
    btn.textContent = "Enviando…";
    status.className = "form__status";
    status.textContent = "";

    const msg = `Olá, Gabriela! Sou ${dados.nome.trim()} e tenho interesse em: ${dados.procedimento}. Gostaria de agendar uma avaliação.`;
    let salvo = true;
    try { await salvarLead(dados); } catch { salvo = false; }

    // Mesmo se o banco falhar, o contato segue pelo WhatsApp
    if (!WHATSAPP_NUMERO && navigator.clipboard) {
      try { await navigator.clipboard.writeText(msg); } catch { /* sem permissão: segue */ }
    }
    status.className = "form__status ok";
    status.innerHTML = "";
    const texto = document.createElement("span");
    texto.textContent = salvo
      ? "Recebi seu contato! Abrindo o WhatsApp… "
      : "Não consegui registrar agora, mas você pode falar direto comigo: ";
    const link = document.createElement("a");
    link.href = linkWhatsApp(msg);
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "abrir WhatsApp";
    status.append(texto, link);

    form.reset();
    btn.disabled = false;
    btn.textContent = "Quero ser chamada no WhatsApp";
    if (salvo) setTimeout(() => { window.location.href = link.href; }, 1400);
  });
})();
