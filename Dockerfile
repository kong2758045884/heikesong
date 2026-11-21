FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod *.go ./
COPY web/ ./web/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/sanwen . \
    && mkdir -p /out/data/rooms

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /out/sanwen /app/sanwen
COPY --from=build --chown=65532:65532 /out/data/ /data/
WORKDIR /app
USER 65532:65532
ENV DATA_DIR=/data/rooms
EXPOSE 8787
ENTRYPOINT ["/app/sanwen"]
