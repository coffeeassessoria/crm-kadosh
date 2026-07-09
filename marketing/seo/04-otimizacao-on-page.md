# Otimização On-Page — kadoshminicacambas.com.br

## Status atual (diagnóstico)

| Item | Status |
|---|---|
| Meta title | ⚠️ Existe mas não otimizado pra keyword |
| Meta description | ❌ Ausente |
| Schema LocalBusiness | ❌ Ausente |
| Sitemap.xml | ❌ Ausente (404) |
| Robots.txt | ❌ Não verificado |
| Open Graph | ❌ Não verificado |
| H1 único | ⚠️ A verificar |
| Site mobile | ✅ Aparenta ser responsivo |
| HTTPS | ✅ Ativo |

---

## Meta tags otimizadas (aplicar no `<head>` do HTML)

```html
<!-- SEO básico -->
<title>Mini Caçamba em Sinop-MT | Aluguel a partir de R$249 | Kadosh</title>
<meta name="description" content="Aluguel de mini caçamba em Sinop-MT a partir de R$249. Entrega rápida, sem burocracia. Ideal pra reforma, obra e limpeza de quintal. Chame no WhatsApp!">
<meta name="keywords" content="mini caçamba sinop, aluguel caçamba sinop mt, locação caçamba sinop, caçamba entulho sinop, caçamba reforma sinop mt">
<link rel="canonical" href="https://kadoshminicacambas.com.br/">

<!-- Open Graph (WhatsApp, Facebook, LinkedIn) -->
<meta property="og:title" content="Mini Caçamba em Sinop-MT | Kadosh Mini Caçambas">
<meta property="og:description" content="Aluguel de mini caçamba a partir de R$249. Entrega rápida em toda Sinop-MT. Chame no WhatsApp!">
<meta property="og:image" content="https://kadoshminicacambas.com.br/og-image.jpg">
<meta property="og:url" content="https://kadoshminicacambas.com.br/">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">

<!-- Twitter/X Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Mini Caçamba em Sinop-MT | Kadosh">
<meta name="twitter:description" content="Aluguel de mini caçamba a partir de R$249. Entrega rápida em toda Sinop-MT.">
```

---

## Schema Markup LocalBusiness (copiar e colar antes do `</body>`)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Kadosh Mini Caçambas",
  "image": "https://kadoshminicacambas.com.br/og-image.jpg",
  "description": "Aluguel de mini caçamba em Sinop-MT a partir de R$249. Entrega rápida, sem burocracia. Ideal pra reforma, obra e limpeza de quintal.",
  "url": "https://kadoshminicacambas.com.br",
  "telephone": "+556699658-5048",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Sinop",
    "addressRegion": "MT",
    "addressCountry": "BR"
  },
  "areaServed": {
    "@type": "City",
    "name": "Sinop"
  },
  "priceRange": "R$249–R$499",
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
      "opens": "07:00",
      "closes": "18:00"
    }
  ],
  "sameAs": [
    "https://www.instagram.com/kadoshminicacambas"
  ]
}
</script>
```

---

## Schema FAQ (adicionar junto com seção de Dúvidas no site)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Quanto custa alugar uma mini caçamba em Sinop?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "O aluguel de mini caçamba na Kadosh começa em R$249, incluindo entrega, 1 dia de permanência e retirada. Diária adicional: R$15 por caçamba."
      }
    },
    {
      "@type": "Question",
      "name": "Quanto tempo a caçamba pode ficar no local?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "A diária padrão é de 1 dia. Cada dia adicional custa R$15 por caçamba. Combinamos o prazo de retirada no momento do agendamento."
      }
    },
    {
      "@type": "Question",
      "name": "O que pode ser colocado na mini caçamba?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Entulho de obra, terra, areia, tijolos, madeira, móveis velhos e resíduos domésticos em geral. Não aceitamos materiais tóxicos, químicos ou hospitalares."
      }
    },
    {
      "@type": "Question",
      "name": "Atende qual região de Sinop?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Atendemos toda a cidade de Sinop-MT, sem restrição por bairro."
      }
    },
    {
      "@type": "Question",
      "name": "Como faço pra alugar uma caçamba?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "É só chamar no WhatsApp (66) 9 9658-5048. Combinamos data, endereço e horário de entrega. Sem burocracia."
      }
    }
  ]
}
</script>
```

---

## Sitemap.xml (criar o arquivo em /sitemap.xml)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://kadoshminicacambas.com.br/</loc>
    <lastmod>2026-06-22</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

## Robots.txt (criar o arquivo em /robots.txt)

```
User-agent: *
Allow: /

Sitemap: https://kadoshminicacambas.com.br/sitemap.xml
```

---

## Headings sugeridos para o site

| Seção | Tag | Texto sugerido |
|---|---|---|
| Hero | H1 | Mini Caçamba em Sinop-MT a partir de R$249 |
| Como funciona | H2 | Como funciona o aluguel de caçamba |
| Serviços | H2 | Para que serve a mini caçamba |
| Diferenciais | H2 | Por que escolher a Kadosh |
| Depoimentos | H2 | O que dizem nossos clientes |
| FAQ | H2 | Perguntas frequentes sobre aluguel de caçamba em Sinop |
| CTA final | H2 | Peça sua mini caçamba agora |

---

## Checklist técnico

- [ ] Aplicar meta title e description
- [ ] Inserir schema LocalBusiness (JSON-LD)
- [ ] Inserir schema FAQPage (JSON-LD)
- [ ] Criar sitemap.xml
- [ ] Criar robots.txt
- [ ] Adicionar Open Graph tags
- [ ] Criar og-image.jpg (1200x630px) com logo e tagline
- [ ] Cadastrar site no Google Search Console (search.google.com/search-console)
- [ ] Enviar sitemap no Search Console
- [ ] Cadastrar site no Google Analytics (GA4)
- [ ] Alt text em todas as imagens (ex: alt="mini caçamba Sinop MT Kadosh")
- [ ] Revisar H1 único por página
