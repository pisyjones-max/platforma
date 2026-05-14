from pathlib import Path
import re

path = Path('/Users/evgenijsysoev/PyCharmProjects/platforma/script.js')
text = path.read_text(encoding='utf-8', errors='ignore')

schema_function = """

// ══ PRODUCT SCHEMA SEO ═════════════════════════════════════════════════════
function injectProductSchema(prod, variant) {

  const old = document.getElementById('product-schema');
  if (old) old.remove();

  const price = Math.round((variant.price || 0) * DISCOUNT_RATE);

  const schema = {
    "@context": "https://schema.org/",
    "@type": "Product",

    "name": prod.name + (variant.name ? ' — ' + variant.name : ''),
    "description": prod.description || '',
    "image": variant.images || [],

    "sku": variant.sku || prod.id,
    "mpn": variant.sku || prod.id,

    "brand": {
      "@type": "Brand",
      "name": prod.brand || "PLATFORMA"
    },

    "category": activeCat?.name || '',

    "offers": {
      "@type": "Offer",
      "url": window.location.href,
      "priceCurrency": "RUB",
      "price": price,
      "availability": "https://schema.org/InStock",
      "itemCondition": "https://schema.org/NewCondition",

      "seller": {
        "@type": "Organization",
        "name": "PLATFORMA"
      }
    }
  };

  if (prod.rating) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": prod.rating,
      "reviewCount": prod.reviewCount || 1
    };
  }

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'product-schema';
  script.textContent = JSON.stringify(schema);

  document.head.appendChild(script);
}
"""

# Insert function before openProd
if 'function injectProductSchema(prod, variant)' not in text:
    text = re.sub(
        r'(function openProd\(id\)\s*\{)',
        schema_function + r'\n\1',
        text,
        count=1
    )

# Insert call inside openProd after variant declaration
patterns = [
    r'(const variant\s*=\s*prod\.variants\[modalVar\];)',
    r'(let variant\s*=\s*prod\.variants\[modalVar\];)'
]

inserted = False
for pattern in patterns:
    if re.search(pattern, text):
        text = re.sub(
            pattern,
            r'\1\n\n  injectProductSchema(prod, variant);',
            text,
            count=1
        )
        inserted = True
        break

out_path = Path('script_schema_ready.js')
out_path.write_text(text, encoding='utf-8')

print(f'Готово: {out_path}')
print('Schema.org Product автоматически встроен в script.js')
