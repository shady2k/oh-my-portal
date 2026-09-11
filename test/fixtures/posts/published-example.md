---
title: "Опубликованная запись"
slug: published-example
date: 2026-01-02
updated: 2026-02-03
revisions:
  - date: 2026-02-03
    before: Достаточно перезапускать прокси.
    after: Нужно дождаться готовности туннеля.
    reason: Повторная проверка выявила зависимость от порядка запуска.
kind: article
status: published
author: human
summary: "Существует в сборке."
tags: [homelab]
lang: ru
tools:
  - name: wireguard
    version: "1.0.20250521"
recipe:
  goal: "Проверить, что ядро попадает в индекс"
  verified_on: 2026-01-02
  stack:
    - name: caddy
      version: "2.9.1"
  steps:
    - id: start
      cmd: "caddy run --config /etc/caddy/Caddyfile"
  pitfalls:
    - symptom: "502 после перезапуска"
      cause: "Апстрим ещё не поднялся"
      fix: "Добавить readiness probe"
---

Тело опубликованной записи. Туннель поднимается раньше прокси, иначе адрес не
резолвится. Подробности — во [внешнем источнике](https://example.org/external).
