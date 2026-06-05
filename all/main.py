import json
from datetime import datetime
from xml.sax.saxutils import escape


def generate_vk_xml(json_filepath, output_xml_filepath):
    # Загружаем JSON
    with open(json_filepath, 'r', encoding='utf-8') as file:
        data = json.load(file)

    # Текущая дата в нужном формате
    current_date = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Функция для безопасного экранирования спецсимволов для XML
    def safe_xml(text):
        if not text:
            return ""
        return escape(str(text).strip(), {'"': "&quot;", "'": "&apos;"})

    # Инициализация XML
    xml_output = [
        '<?xml version="1.0" encoding="utf-8"?>',
        f'<yml_catalog date="{current_date}">',
        '  <shop>',
        '    <name>mk4s.ru</name>',
        '    <company>4 Сезона</company>',
        '    <url>https://mk4s.ru/</url>',
        '    <currencies>',
        '      <currency id="RUB" rate="1"/>',
        '    </currencies>',
        '    <categories>'
    ]

    # Обработка категорий
    category_map = {}
    cat_id_counter = 1

    for category in data.get('categories', []):
        cat_name = safe_xml(category.get('name', 'Без названия'))
        category_map[category['slug']] = cat_id_counter
        xml_output.append(f'      <category id="{cat_id_counter}">{cat_name}</category>')
        cat_id_counter += 1

    xml_output.append('    </categories>')
    xml_output.append('    <offers>')

    # Обработка товаров и их вариантов
    for category in data.get('categories', []):
        cat_id = category_map[category['slug']]

        for product in category.get('products', []):
            group_id = safe_xml(product.get('sku_base', ''))
            base_title = product.get('title', '')
            desc = product.get('description', '')

            # Если описания нет, дублируем заголовок, чтобы ВК не ругался на пустоту
            if not desc:
                desc = base_title
            desc = safe_xml(desc)

            features = product.get('features', {})

            for variant in product.get('variants', []):
                offer_id = safe_xml(variant.get('sku', ''))

                # Обработка цены (превращаем 1563.0 в 1563)
                raw_price = variant.get('price', 0)
                if isinstance(raw_price, float) and raw_price.is_integer():
                    price = int(raw_price)
                else:
                    price = raw_price

                variant_name = variant.get('sku_name', '')

                # Формируем полное название
                full_name = safe_xml(f"{base_title} {variant_name}")

                xml_output.append(f'      <offer id="{offer_id}" available="true" group_id="{group_id}">')
                xml_output.append(f'        <price>{price}</price>')
                xml_output.append('        <currencyId>RUB</currencyId>')
                xml_output.append(f'        <categoryId>{cat_id}</categoryId>')

                # ВАЖНО: Тег <picture> в схеме YML должен идти СТРОГО до <name> и <description>
                # Ограничиваем срез до 5 картинок (лимит ВК для товаров)
                images = variant.get('images', [])[:5]
                for img_url in images:
                    xml_output.append(f'        <picture>{safe_xml(img_url)}</picture>')

                xml_output.append(f'        <name>{full_name}</name>')
                xml_output.append(f'        <description>{desc}</description>')

                # Добавляем параметры
                for f_name, f_value in features.items():
                    if f_value:  # Строго пропускаем пустые характеристики
                        xml_output.append(f'        <param name="{safe_xml(f_name)}">{safe_xml(f_value)}</param>')

                # Добавляем цвет из варианта, если его не было в базовых features
                color = variant.get('color')
                if color and "Цвет" not in features:
                    xml_output.append(f'        <param name="Цвет">{safe_xml(color)}</param>')

                xml_output.append('      </offer>')

    # Закрываем теги
    xml_output.extend([
        '    </offers>',
        '  </shop>',
        '</yml_catalog>'
    ])

    # Записываем результат
    with open(output_xml_filepath, 'w', encoding='utf-8') as file:
        file.write('\n'.join(xml_output))

    print(f"Готово! Файл {output_xml_filepath} собран по строгой YML схеме.")


# Запуск
generate_vk_xml('catalog.json', 'vk_catalog_fixed.xml')