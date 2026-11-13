"""Busca ofertas de afiliado e grava como rascunho na tabela achadinhos.

Roda no GitHub Actions (.github/workflows/buscar-ofertas.yml).

Variáveis de ambiente:
  SUPABASE_URL          https://<ref>.supabase.co
  SUPABASE_SECRET_KEY   chave sb_secret_... do robô
  SHOPEE_APP_ID         opcional; sem ele a Shopee é pulada
  SHOPEE_SECRET         opcional

Repositório público: o log mostra só contagens.
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from buscador.oferta import passa_filtros, ranquear
from buscador.repositorio import Repositorio
from buscador.shopee import ConectorShopee

CONFIG = Path(__file__).resolve().parent.parent / "config" / "buscas.json"


def executar(config: dict, conectores: list, repo, agora: datetime) -> dict:
    filtros = config["filtros"]
    escolhidas: dict[tuple[str, str], object] = {}
    buscas = falhas = 0
    for conector in conectores:
        for busca in config["buscas"]:
            buscas += 1
            try:
                achadas = conector.buscar(busca["termo"], limite=50)
            except Exception as erro:  # uma busca ruim não derruba as outras
                falhas += 1
                print(f"Falha em {conector.origem} ({type(erro).__name__})")
                continue
            boas = ranquear([o for o in achadas if passa_filtros(o, filtros)])[: filtros["por_busca"]]
            for o in boas:
                chave = (o.origem, o.id_externo)
                if chave not in escolhidas:
                    o.categoria = busca.get("categoria")
                    escolhidas[chave] = o
    novas, atualizadas = repo.sincronizar(list(escolhidas.values()), agora.isoformat())
    limite = agora - timedelta(days=config.get("dias_rascunho", 14))
    apagadas = repo.limpar_rascunhos(limite.isoformat())
    return {"buscas": buscas, "falhas": falhas, "novas": novas, "atualizadas": atualizadas, "apagadas": apagadas}


def main() -> int:
    url = os.environ.get("SUPABASE_URL", "").strip()
    chave = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not url or not chave:
        print("SUPABASE_URL/SUPABASE_SECRET_KEY ausentes")
        return 1
    conectores = []
    app_id = os.environ.get("SHOPEE_APP_ID", "").strip()
    segredo = os.environ.get("SHOPEE_SECRET", "").strip()
    if app_id and segredo:
        conectores.append(ConectorShopee(app_id, segredo))
    else:
        print("Shopee sem credenciais: busca pulada")
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    r = executar(config, conectores, Repositorio(url, chave), datetime.now(timezone.utc))
    print(f"Buscas: {r['buscas']} | falhas: {r['falhas']} | novas: {r['novas']} | "
          f"atualizadas: {r['atualizadas']} | rascunhos antigos apagados: {r['apagadas']}")
    return 1 if r["buscas"] and r["falhas"] == r["buscas"] else 0


if __name__ == "__main__":
    sys.exit(main())
