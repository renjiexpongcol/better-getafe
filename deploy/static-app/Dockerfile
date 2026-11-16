FROM nginx:1.27-alpine

ARG APP_SURFACE

RUN test -n "$APP_SURFACE"
COPY dist/apps/${APP_SURFACE}/ /usr/share/nginx/html/
COPY deploy/static-app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
