# Папка для фотографий и 3D-моделей

Сюда кладём файлы — Express раздаёт эту папку как есть (`/media/...`). В базе данных хранятся только пути.

## Правила
- **Фото:** JPG или WebP, ширина 1600 px, до 300 КБ на файл (сжать можно на squoosh.app).
- **3D-модели:** формат GLB (glTF), до 5 МБ на файл (сжать можно на gltf.report).
- Названия файлов — латиницей, строчными, без пробелов (как в таблице ниже).
- Сайт сам подхватывает файл по пути из БД. Нет файла — показывается заглушка.

## Общие картинки сайта (необязательно)
`media/hero.jpg` — главное фото на главной; `media/about-1.jpg` и `media/about-2.jpg` — фото в блоке «О городе».

## Какой файл как называть
| id | Место | Фото | 3D |
|---|---|---|---|
| 1 | Пятницкие ворота | `photos/pyatnitskie-vorota.jpg` | `models/pyatnitskie-vorota.glb` |
| 2 | Маринкина (Коломенская) башня | `photos/marinkina-bashnya.jpg` | `models/marinkina-bashnya.glb` |
| 3 | Грановитая башня | `photos/granovitaya-bashnya.jpg` | `models/granovitaya-bashnya.glb` |
| 8 | Стены Коломенского кремля | `photos/steny-kremlya.jpg` | `models/steny-kremlya.glb` |
| 9 | Успенский кафедральный собор | `photos/uspenskiy-sobor.jpg` | `models/uspenskiy-sobor.glb` |
| 10 | Успенская шатровая звонница | `photos/zvonnitsa.jpg` | `models/zvonnitsa.glb` |
| 15 | Свято-Троицкий Ново-Голутвин монастырь | `photos/novo-golutvin.jpg` | `models/novo-golutvin.glb` |
| 16 | Успенский Брусенский монастырь | `photos/brusenskiy-monastyr.jpg` | `models/brusenskiy-monastyr.glb` |
| 17 | Храм Иоанна Предтечи на Городище | `photos/ioanna-predtechi.jpg` | `models/ioanna-predtechi.glb` |
| 21 | Усадьба купцов Лажечниковых | `photos/lazhechnikovy.jpg` | `models/lazhechnikovy.glb` |
| 25 | Коломенская картинная галерея «Дом Озерова» | `photos/dom-ozerova.jpg` | `models/dom-ozerova.glb` |
| 27 | Музей «Калачная» | `photos/kalachnaya.jpg` | `models/kalachnaya.glb` |
| 28 | Музейная фабрика пастилы | `photos/pastila.jpg` | `models/pastila.glb` |
| 31 | Памятник Дмитрию Донскому | `photos/dmitriy-donskoy.jpg` | `models/dmitriy-donskoy.glb` |
| 34 | Соборная площадь | `photos/sobornaya-ploschad.jpg` | `models/sobornaya-ploschad.glb` |
| 35 | Дом с мезонином | `photos/dom-s-mezoninom.jpg` | `models/dom-s-mezoninom.glb` |
| 36 | Литературное кафе «Лажечников» | `photos/kafe-lazhechnikov.jpg` | `models/kafe-lazhechnikov.glb` |
| 38 | Кафе «Лайт» | `photos/kafe-layt.jpg` | `models/kafe-layt.glb` |
| 39 | Кафе-кондитерская «Хороший пирог» | `photos/horoshiy-pirog.jpg` | `models/horoshiy-pirog.glb` |

После добавления файлов выполните `sql/update_media.sql` в консоли Aiven.

## Лицензии
Берите свои фотографии или снимки с Wikimedia Commons / Unsplash и указывайте автора, если лицензия требует.
