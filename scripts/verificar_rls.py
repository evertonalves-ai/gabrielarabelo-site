"""Confere as permissões públicas da tabela achadinhos (chave publicável).

Uso: python scripts/verificar_rls.py
Sai com código 1 se alguma permissão estiver errada.
"""
import sys

import requests

URL = "https://kjcmorylizjelnnfjbas.supabase.co/rest/v1/achadinhos"
CHAVE = "sb_publishable_JTFPBNC2iM1LXi0IDYxSfQ_HPAH6BB0"
H = {"apikey": CHAVE, "Content-Type": "application/json"}


def checar(nome: str, ok: bool) -> bool:
    print(("OK   " if ok else "FALHA"), nome)
    return ok


def main() -> int:
    r_aprov = requests.get(URL, params={"select": "titulo", "status": "eq.aprovado"}, headers=H, timeout=20)
    r_rasc = requests.get(URL, params={"select": "titulo", "status": "eq.rascunho"}, headers=H, timeout=20)
    r_id = requests.get(URL, params={"select": "id"}, headers=H, timeout=20)
    r_com = requests.get(URL, params={"select": "comissao_pct"}, headers=H, timeout=20)
    r_ins = requests.post(URL, json={"titulo": "x teste", "link": "https://a.b"}, headers=H, timeout=20)
    r_upd = requests.patch(URL, params={"status": "eq.aprovado"}, json={"titulo": "x"}, headers=H, timeout=20)
    resultados = [
        checar("anon lê aprovados (200)", r_aprov.status_code == 200),
        checar("anon não recebe rascunhos (lista vazia)", r_rasc.status_code == 200 and r_rasc.json() == []),
        checar("anon não lê id (401)", r_id.status_code == 401),
        checar("anon não lê comissão (401)", r_com.status_code == 401),
        checar("anon não insere (401)", r_ins.status_code == 401),
        checar("anon não edita (401)", r_upd.status_code == 401),
    ]
    return 0 if all(resultados) else 1


if __name__ == "__main__":
    sys.exit(main())
