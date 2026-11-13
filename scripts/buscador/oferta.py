"""Formato comum das ofertas, independente da loja de origem."""
from dataclasses import dataclass


@dataclass
class Oferta:
    origem: str
    id_externo: str
    titulo: str
    link: str
    imagem_url: str | None = None
    loja: str | None = None
    preco_atual: float | None = None
    preco_original: float | None = None
    desconto_pct: float | None = None
    comissao_pct: float | None = None
    avaliacao: float | None = None
    vendas: int | None = None
    categoria: str | None = None

    def _comuns(self) -> dict:
        return {
            "link": self.link,
            "imagem_url": self.imagem_url if (self.imagem_url or "").startswith("https://") else None,
            "preco": formatar_preco(self.preco_atual),
            "preco_atual": self.preco_atual,
            "preco_original": self.preco_original,
            "desconto_pct": self.desconto_pct,
            "comissao_pct": self.comissao_pct,
            "avaliacao": self.avaliacao,
            "vendas": self.vendas,
        }

    def para_insert(self) -> dict:
        """Linha nova. Sem 'status': o banco aplica o default 'rascunho'."""
        return {
            "origem": self.origem,
            "id_externo": self.id_externo,
            "titulo": self.titulo.strip()[:120],
            "loja": (self.loja or "").strip()[:40] or None,
            "categoria": (self.categoria or "").strip()[:40] or None,
            **self._comuns(),
        }

    def para_update(self, agora_iso: str) -> dict:
        """Atualização de oferta já existente: preserva título, categoria e status da Gabi."""
        return {**self._comuns(), "atualizado_em": agora_iso}


def formatar_preco(valor: float | None) -> str | None:
    if valor is None:
        return None
    texto = f"{valor:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"R$ {texto}"


def passa_filtros(o: Oferta, filtros: dict) -> bool:
    if not o.link.startswith("https://"):
        return False
    if o.avaliacao is None or o.vendas is None or o.comissao_pct is None:
        return False
    return (
        o.avaliacao >= filtros["avaliacao_min"]
        and o.vendas >= filtros["vendas_min"]
        and o.comissao_pct >= filtros["comissao_min_pct"]
    )


def ranquear(ofertas: list[Oferta]) -> list[Oferta]:
    return sorted(ofertas, key=lambda o: (o.comissao_pct or 0) * (o.vendas or 0), reverse=True)
