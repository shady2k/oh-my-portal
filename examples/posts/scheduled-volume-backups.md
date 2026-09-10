---
title: "Бэкап томов по расписанию"
slug: scheduled-volume-backups
date: 2026-08-14
kind: article
status: published
author: human
summary: "Снимок тома раз в сутки, проверка восстановления раз в неделю — иначе это не бэкап, а надежда."
tags: [homelab, kubernetes]
lang: ru
tools:
  - name: restic
    version: "0.17.3"
  - name: k3s
    version: "1.31.4"
related: [reverse-proxy-behind-wireguard]
recipe:
  goal: "Тома снимаются по расписанию, восстановление проверяется автоматически"
  verified_on: 2026-08-14
  stack:
    - name: restic
      version: "0.17.3"
    - name: k3s
      version: "1.31.4"
  steps:
    - id: repo
      cmd: "restic init --repo /srv/backup/restic"
      note: "Репозиторий на отдельном диске — не на том, который бэкапим"
    - id: schedule
      cmd: "kubectl apply -f backup-cronjob.yaml"
      note: "CronJob, не systemd timer: расписание живёт там же, где нагрузка"
  pitfalls:
    - symptom: "Снимки идут, восстановление падает на первом же файле"
      cause: "Бэкап снимался с примонтированного тома во время записи"
      fix: "Снимать с моментального снимка файловой системы, а не с живого каталога"
  do_not:
    - "Не хранить пароль репозитория в том же кластере, который бэкапите"
---

> Это синтетическая статья-пример. Она существует, чтобы движок собирался без
> контент-репозитория и чтобы была видна форма данных — включая блоки кода.

Бэкап, который никто не восстанавливал, — это не бэкап. Это предположение о том,
что файлы читаются, проверенное ровно ноль раз. Разница вскрывается в тот
единственный день, когда проверка имела значение.

Поэтому расписаний здесь два: снимок раз в сутки и восстановление раз в неделю.
Второе — не перестраховка, а единственное, что превращает первое в утверждение.

## Репозиторий на отдельном диске

Очевидное, но повторю: репозиторий не должен жить на том же устройстве, что и
данные. Диск отказывает целиком, а не по каталогам.

```bash
# Отдельный диск, отдельный пароль, отдельная судьба.
export RESTIC_REPOSITORY=/srv/backup/restic
export RESTIC_PASSWORD_FILE=/etc/restic/password

restic init
restic backup /var/lib/rancher/k3s/storage --tag nightly --exclude-caches
restic forget --keep-daily 7 --keep-weekly 5 --keep-monthly 12 --prune
```

`--exclude-caches` тут не косметика: без него в снимок попадают каталоги сборки,
и репозиторий растёт на порядок быстрее, чем данные, которые вы на самом деле
храните.

## Расписание там же, где нагрузка

Соблазн — повесить systemd timer на хосте. Не стоит: тогда расписание живёт в
одном месте, а то, что оно бэкапит, в другом, и они расходятся при первом же
переносе.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: volume-backup
  namespace: storage
spec:
  schedule: "17 3 * * *"
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: restic
              image: restic/restic:0.17.3
              args: ["backup", "/data", "--tag", "nightly", "--exclude-caches"]
              envFrom:
                - secretRef:
                    name: restic-credentials
```

`concurrencyPolicy: Forbid` важнее, чем кажется. Без него медленный ночной
прогон встречается со следующим, оба пишут в один репозиторий, и вы узнаёте об
этом через неделю по ошибке блокировки.

## Проверка восстановления

Вот та часть, которую пропускают. Она же единственная, которая отличает бэкап от
надежды.

```bash
# Восстановить последний снимок во временный каталог и сверить контрольные суммы —
# в одну строку, чтобы это было одной задачей планировщика, а не инструкцией в вики.
restic restore latest --target /tmp/restore-check --include /data/postgres && find /tmp/restore-check -type f -print0 | xargs -0 sha256sum | sort -k2 > /tmp/restore.sums && diff /tmp/restore.sums /srv/backup/expected.sums
```

Если эта команда падает — падает она в понедельник утром, когда есть время
разобраться, а не в тот день, когда данные уже потеряны.

## Чего это не решает

Утечку пароля. Репозиторий зашифрован, и это значит ровно одно: он настолько
защищён, насколько защищён файл с паролем. Если пароль лежит в том же кластере,
чей отказ вы предполагаете, — схема замкнута сама на себя.
