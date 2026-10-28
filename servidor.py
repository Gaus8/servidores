from fastapi import FastAPI
import uvicorn 
import sys

app = FastAPI(
    title = "Servidores de la red dinámica"
)

puerto = int(sys.argv[1])
nombre = sys.argv[2]

contador = 0

@app.get("/")
def inicio():
    return{
        "servidor": nombre,
        "mensaje": "Servidor en funcionamiento",
        "puerto": puerto,
    }

@app.get("/procesar")
def procesar():
    global contador
    contador += 1
    return{
        "servidor": nombre,
        "mensaje": f"Solicitud procesada {contador} veces",
        "puerto": puerto,
    }

@app.get("/health")
def health():
    return{
        "servidor": nombre,
        "mensaje": "Servidor activo",
        "puerto": puerto,
    }
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=puerto)