"""Acesso à tabela public.achadinhos via PostgREST, com a chave secreta do robô."""
from collections import defaultdict

import requests

from buscador.oferta import Oferta


class Repositorio:
    def __init__(self, url: str, chave: str, sessao=None):
        self.base = f"{url.rstrip('/')}/rest/v1/achadinhos"
        self.chave = chave
        self.sessao = sessao or requests.Session()

    def _req(self, metodo: str, params=None, corpo=None, prefer: str | None = None):
        headers = {
            "apikey": self.chave,
            "Authorization": f"Bearer {self.chave}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        resp = self.sessao.request(metodo, self.base, params=params, json=corpo, headers=headers, timeout=30)
        resp.raise_for_status()
        return resp

    def existentes(self, origem: str, ids: list[str]) -> set[str]:
        if not ids:
            return set()
        lista = ",".join(f'"{i}"' for i in ids)
        resp = self._req("GET", params={"select": "id_externo", "origem": f"eq.{origem}", "id_externo": f"in.({lista})"})
        return {linha["id_externo"] for linha in resp.json()}

    def sincronizar(self, ofertas: list[Oferta], agora_iso: str) -> tuple[int, int]:
        por_origem: dict[str, list[Oferta]] = defaultdict(list)
        for o in ofertas:
            por_origem[o.origem].append(o)
        novas = atualizadas = 0
        for origem, grupo in por_origem.items():
            ja = self.existentes(origem, [o.id_externo for o in grupo])
            inserir = [o.para_insert() for o in grupo if o.id_externo not in ja]
            if inserir:
                self._req("POST", corpo=inserir, prefer="return=minimal")
                novas += len(inserir)
            for o in grupo:
                if o.id_externo in ja:
                    self._req(
                        "PATCH",
                        params={"origem": f"eq.{origem}", "id_externo": f"eq.{o.id_externo}"},
                        corpo=o.para_update(agora_iso),
                        prefer="return=minimal",
                    )
                    atualizadas += 1
        return novas, atualizadas

    def limpar_rascunhos(self, antes_de_iso: str) -> int:
        resp = self._req(
            "DELETE",
            params={"status": "eq.rascunho", "atualizado_em": f"lt.{antes_de_iso}", "select": "id"},
            prefer="return=representation",
        )
        return len(resp.json())
