# Медиа сайта

Фотографии мест и маршрутов находятся в `photos/`. Их пути берутся из PostgreSQL.

Модели хранятся в `artifacts/3d/` и доступны через Express по адресам ниже. Не копируйте GLB сюда: соответствия и разрешённые файлы заданы в `backend/models.js`.

`model-posters/` содержит уменьшенные WebP-превью для сайта. Исходные ракурсы остаются рядом с моделями. Пересборка: `python3 scripts/prepare-model-posters.py` (Pillow).

| Модель | Публичный GLB |
|---|---|
| Музей «Коломенская пастила» | `/media/models/kolomenskaya-pastila.glb` |
| Музейная фабрика пастилы | `/media/models/pastila-factory.glb` |
| Маринкина башня и стена кремля | `/media/models/marinkina-tower.glb` |
| Музей «Калачная» | `/media/models/kalachnaya.glb` |
| Музей «Кузнечная слобода» | `/media/models/kuznechnaya-sloboda.glb` |
| Старо-Голутвин монастырь | `/media/models/staro-golutvin.glb` |
| Музей любимой игрушки | `/media/models/toy-museum.glb` |
| Шкала уровней паводковых вод | `/media/models/flood-scale.glb` |
| Музей «Дом самовара» | `/media/models/dom-samovara.glb` |
| Музей-резиденция «Арткоммуналка» | `/media/models/artkommunalka.glb` |
| Музей органической культуры | `/media/models/organic-culture.glb` |
| Музей «Коломенский патефон» | `/media/models/kolomensky-patefon.glb` |
| Усадьба купцов Лажечниковых | `/media/models/lazhechnikov-estate.glb` |
| Музей мыла «Душистыя радости» | `/media/models/dushistye-radosti.glb` |
| Бистро «Рульки вверх» | `/media/models/rulki-vverh.glb` |
| Гостиница «Коломна» | `/media/models/kolomna-hotel.glb` |

Кофейня при «Калачной» использует модель музея. Кофейня в Посаде пока без 3D. API сам возвращает актуальные пути, включая версию для обновления кеша.

Для изображений из внешних источников соблюдайте условия лицензии и указывайте авторство, если это требуется.
