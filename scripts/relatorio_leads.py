"""Relatório semanal de leads do site gabibeauty.com.br.

Busca os leads no Supabase, monta uma planilha Excel (novos da semana + todos)
e envia por e-mail. Roda no GitHub Actions (.github/workflows/relatorio-leads.yml).

Variáveis de ambiente (segredos do repositório no GitHub):
  SUPABASE_URL          https://<ref>.supabase.co
  SUPABASE_SECRET_KEY   chave sb_secret_... só para leitura dos leads
  GMAIL_USER            conta Gmail que envia
  GMAIL_APP_PASSWORD    senha de app do Gmail (não é a senha da conta)
  LEAD_EMAIL_TO         destinatário(s), separados por vírgula

Nunca imprime dados de lead no log: o repositório é público e o log do Actions também.
"""
import io
import os
import smtplib
import sys
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import requests
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

# Brasília (sem horário de verão desde 2019); fixo para não depender de tzdata.
FUSO = timezone(timedelta(hours=-3), "BRT")
DIAS_SEMANA = 7
COLUNAS = [
    ("Data", 18),
    ("Nome", 28),
    ("WhatsApp", 18),
    ("Chamar no WhatsApp", 30),
    ("Procedimento", 34),
    ("Respostas do quiz", 50),
    ("Origem", 30),
]


def env(nome: str) -> str:
    valor = os.environ.get(nome, "").strip()
    if not valor:
        sys.exit(f"Variável de ambiente ausente: {nome}")
    return valor


def buscar_leads(url: str, chave: str) -> list[dict]:
    leads: list[dict] = []
    passo = 1000
    inicio = 0
    while True:
        resp = requests.get(
            f"{url.rstrip('/')}/rest/v1/leads",
            params={
                "select": "created_at,nome,whatsapp,procedimento,quiz,origem",
                "order": "created_at.desc",
            },
            headers={"apikey": chave, "Range": f"{inicio}-{inicio + passo - 1}"},
            timeout=30,
        )
        if resp.status_code not in (200, 206):
            sys.exit(f"Erro ao buscar leads no Supabase: HTTP {resp.status_code}")
        lote = resp.json()
        leads.extend(lote)
        if len(lote) < passo:
            return leads
        inicio += passo


def data_local(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(FUSO)


def formatar_whatsapp(numero: str) -> str:
    d = numero[2:] if numero.startswith("55") and len(numero) > 11 else numero
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return numero


def preencher_aba(ws, titulo: str, leads: list[dict]) -> None:
    ws.title = titulo
    cabecalho = Font(bold=True, color="FFFFFF")
    fundo = PatternFill("solid", fgColor="2B2826")
    for i, (nome, largura) in enumerate(COLUNAS, start=1):
        c = ws.cell(row=1, column=i, value=nome)
        c.font = cabecalho
        c.fill = fundo
        c.alignment = Alignment(vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = largura
    ws.row_dimensions[1].height = 22
    ws.freeze_panes = "A2"

    for linha, lead in enumerate(leads, start=2):
        quando = data_local(lead["created_at"]).replace(tzinfo=None)
        ws.cell(row=linha, column=1, value=quando).number_format = "dd/mm/yyyy hh:mm"
        ws.cell(row=linha, column=2, value=lead.get("nome"))
        ws.cell(row=linha, column=3, value=formatar_whatsapp(lead.get("whatsapp", "")))
        link = ws.cell(row=linha, column=4, value="Abrir conversa")
        link.hyperlink = f"https://wa.me/{lead.get('whatsapp', '')}"
        link.font = Font(color="1F6F43", underline="single")
        ws.cell(row=linha, column=5, value=lead.get("procedimento"))
        ws.cell(row=linha, column=6, value=lead.get("quiz") or "")
        ws.cell(row=linha, column=7, value=lead.get("origem") or "")

    if leads:
        ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUNAS))}{len(leads) + 1}"
    else:
        ws.cell(row=2, column=1, value="Nenhum lead neste período.")


def montar_planilha(novos: list[dict], todos: list[dict]) -> bytes:
    wb = Workbook()
    preencher_aba(wb.active, "Novos da semana", novos)
    preencher_aba(wb.create_sheet(), "Todos os leads", todos)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def enviar(usuario: str, senha: str, para: list[str], assunto: str, corpo: str,
           anexo: bytes, nome_anexo: str) -> None:
    msg = EmailMessage()
    msg["From"] = f"Site Gabi Beauty <{usuario}>"
    msg["To"] = ", ".join(para)
    msg["Subject"] = assunto
    msg.set_content(corpo)
    msg.add_attachment(
        anexo,
        maintype="application",
        subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=nome_anexo,
    )
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as smtp:
        smtp.login(usuario, senha)
        smtp.send_message(msg)


def main() -> None:
    url = env("SUPABASE_URL")
    chave = env("SUPABASE_SECRET_KEY")
    usuario = env("GMAIL_USER")
    senha = env("GMAIL_APP_PASSWORD").replace(" ", "")
    para = [e.strip() for e in env("LEAD_EMAIL_TO").split(",") if e.strip()]

    todos = buscar_leads(url, chave)
    corte = datetime.now(timezone.utc) - timedelta(days=DIAS_SEMANA)
    novos = [l for l in todos if data_local(l["created_at"]) >= corte]

    hoje = datetime.now(FUSO)
    inicio = (hoje - timedelta(days=DIAS_SEMANA)).strftime("%d/%m")
    fim = hoje.strftime("%d/%m/%Y")
    planilha = montar_planilha(novos, todos)

    if novos:
        resumo = f"{len(novos)} lead(s) novo(s) entre {inicio} e {fim}."
    else:
        resumo = f"Nenhum lead novo entre {inicio} e {fim}."
    corpo = (
        f"Olá, Gabi!\n\n{resumo}\n"
        f"Total de leads desde o início: {len(todos)}.\n\n"
        "A planilha em anexo tem duas abas: \"Novos da semana\" e \"Todos os leads\". "
        "Na coluna \"Chamar no WhatsApp\" é só clicar para abrir a conversa.\n\n"
        "Este e-mail é enviado automaticamente toda segunda-feira pelo site gabibeauty.com.br.\n"
    )
    enviar(
        usuario, senha, para,
        assunto=f"Leads do site: {len(novos)} novo(s) na semana ({fim})",
        corpo=corpo,
        anexo=planilha,
        nome_anexo=f"leads-gabibeauty-{hoje:%Y-%m-%d}.xlsx",
    )
    # Só contagens no log, nunca dados pessoais.
    print(f"Relatório enviado: {len(novos)} novos, {len(todos)} no total.")


if __name__ == "__main__":
    main()
