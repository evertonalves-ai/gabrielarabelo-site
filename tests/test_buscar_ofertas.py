from datetime import datetime, timezone

import buscar_ofertas
from buscador.oferta import Oferta

CONFIG = {
    "filtros": {"avaliacao_min": 4.7, "vendas_min": 100, "comissao_min_pct": 5, "por_busca": 1},
    "dias_rascunho": 14,
    "buscas": [{"termo": "a", "categoria": "Skincare"}, {"termo": "b", "categoria": "Corpo"}],
}
AGORA = datetime(2026, 11, 12, 11, 0, tzinfo=timezone.utc)


def of(i, vendas=500):
    return Oferta(origem="shopee", id_externo=i, titulo=f"P{i}", link=f"https://s.shopee.com.br/{i}",
                  avaliacao=4.9, vendas=vendas, comissao_pct=8.0)


class ConectorFalso:
    origem = "shopee"

    def __init__(self, respostas):
        self.respostas = respostas

    def buscar(self, termo, limite=50):
        r = self.respostas[termo]
        if isinstance(r, Exception):
            raise r
        return r


class RepoFalso:
    def __init__(self):
        self.sincronizadas = None
        self.limpeza = None

    def sincronizar(self, ofertas, agora_iso):
        self.sincronizadas = ofertas
        return len(ofertas), 0

    def limpar_rascunhos(self, antes_de_iso):
        self.limpeza = antes_de_iso
        return 3


def test_executar_filtra_ranqueia_categoriza_e_deduplica():
    con = ConectorFalso({"a": [of("1", 200), of("2", 900), of("x", 10)], "b": [of("2", 900)]})
    repo = RepoFalso()
    r = buscar_ofertas.executar(CONFIG, [con], repo, AGORA)
    assert [o.id_externo for o in repo.sincronizadas] == ["2"]
    assert repo.sincronizadas[0].categoria == "Skincare"  # primeira busca que achou vence
    assert r == {"buscas": 2, "falhas": 0, "novas": 1, "atualizadas": 0, "apagadas": 3}
    assert repo.limpeza == "2026-10-29T11:00:00+00:00"


def test_executar_conta_falhas_sem_parar():
    con = ConectorFalso({"a": RuntimeError("caiu"), "b": [of("9")]})
    repo = RepoFalso()
    r = buscar_ofertas.executar(CONFIG, [con], repo, AGORA)
    assert r["falhas"] == 1 and r["novas"] == 1


def test_main_sem_credenciais_shopee_termina_ok(monkeypatch, capsys):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_teste")
    monkeypatch.delenv("SHOPEE_APP_ID", raising=False)
    monkeypatch.delenv("SHOPEE_SECRET", raising=False)
    monkeypatch.setattr(buscar_ofertas, "Repositorio", lambda url, chave: RepoFalso())
    assert buscar_ofertas.main() == 0
    assert "Shopee sem credenciais" in capsys.readouterr().out
