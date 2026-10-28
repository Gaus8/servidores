from __future__ import annotations

import asyncio
import os
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="Balanceador de carga",
    description="Sistema de distribución de solicitudes entre servidores dinámicos",
)
app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Se pueden reemplazar los puertos de ejemplo con SERVIDORES_INICIALES,
# separados por comas (por ejemplo: http://127.0.0.1:8001,http://127.0.0.1:8002).
_DEFAULT_URLS = os.getenv(
    "SERVIDORES_INICIALES",
    "http://127.0.0.1:8001,http://127.0.0.1:8002,http://127.0.0.1:8003",
)
servidores: list[dict[str, Any]] = []

def _add_server(url: str, nombre: str | None = None) -> dict[str, Any]:
    url = url.strip().rstrip("/")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or not parsed.port:
        raise ValueError("La URL debe incluir http(s), host y puerto, por ejemplo http://127.0.0.1:8001")
    if any(server["url"] == url for server in servidores):
        raise ValueError("Ese servidor ya está registrado")
    server = {"nombre": nombre or f"Servidor {parsed.port}", "url": url, "puerto": parsed.port}
    servidores.append(server)
    return server

for _url in filter(None, (part.strip() for part in _DEFAULT_URLS.split(","))):
    try:
        _add_server(_url)
    except ValueError:
        # Ignora entradas inválidas de configuración y conserva los servidores válidos.
        continue

siguiente = 0
total_solicitudes = 0
solicitudes_por_servidor: Counter[str] = Counter()
_lock = asyncio.Lock()


class ServidorNuevo(BaseModel):
    url: str = Field(..., examples=["http://127.0.0.1:8004"])
    nombre: str | None = Field(default=None, examples=["Servidor 4"])


async def _health(client: httpx.AsyncClient, server: dict[str, Any]) -> bool:
    try:
        response = await client.get(f"{server['url']}/health")
        return response.is_success
    except httpx.RequestError:
        return False


@app.get("/")
async def inicio():
    return FileResponse(Path(__file__).parent / "static" / "index.html")


@app.get("/info")
async def informacion():
    return {
        "mensaje": "Balanceador de carga en funcionamiento",
        "servidores_configurados": len(servidores),
        "total_solicitudes": total_solicitudes,
    }


@app.get("/servidores")
async def obtener_servidores():
    async with httpx.AsyncClient(timeout=2.0) as client:
        estados = await asyncio.gather(*(_health(client, server) for server in servidores))
    return [
        {**server, "estado": "Activo" if active else "Inactivo"}
        for server, active in zip(servidores, estados)
    ]


@app.post("/servidores", status_code=201)
async def registrar_servidor(payload: ServidorNuevo):
    try:
        return {**_add_server(payload.url, payload.nombre), "estado": "Pendiente de verificación"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/servidores/{puerto}")
async def quitar_servidor(puerto: int):
    for index, server in enumerate(servidores):
        if server["puerto"] == puerto:
            return {"eliminado": servidores.pop(index)}
    raise HTTPException(status_code=404, detail="No existe un servidor registrado en ese puerto")


@app.get("/solicitar")
async def solicitar():
    global siguiente, total_solicitudes
    if not servidores:
        raise HTTPException(status_code=503, detail="No hay servidores registrados")

    async with _lock:
        cantidad = len(servidores)
        # Cada intento toma el siguiente servidor. Los que no respondan se omiten.
        for _ in range(cantidad):
            server = servidores[siguiente % cantidad]
            siguiente = (siguiente + 1) % cantidad
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    health = await client.get(f"{server['url']}/health")
                    if not health.is_success:
                        continue
                    response = await client.get(f"{server['url']}/procesar")
                    response.raise_for_status()
                    result = response.json()
            except (httpx.RequestError, httpx.HTTPStatusError, ValueError):
                continue

            total_solicitudes += 1
            nombre = str(result.get("servidor", server["nombre"]))
            solicitudes_por_servidor[nombre] += 1
            return {
                "servidor": nombre,
                "puerto": result.get("puerto", server["puerto"]),
                "mensaje": result.get("mensaje", "Solicitud procesada"),
                "resultado": result,
                "total_solicitudes": total_solicitudes,
            }

    raise HTTPException(status_code=503, detail="No hay servidores activos disponibles")


@app.get("/estadisticas")
async def estadisticas():
    return {
        "total_solicitudes": total_solicitudes,
        "solicitudes_por_servidor": dict(solicitudes_por_servidor),
    }



