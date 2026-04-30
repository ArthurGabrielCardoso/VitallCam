package com.vitallcam.android

import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import java.net.InetSocketAddress
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Servidor WebSocket local que envia frames JPEG da câmera USB para o WebView.
 * Roda em localhost:8766 para evitar conflito com outras portas.
 */
class FrameWebSocketServer(port: Int = 8766) : WebSocketServer(InetSocketAddress(port)) {

    private val clients = CopyOnWriteArraySet<WebSocket>()

    override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
        clients.add(conn)
    }

    override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
        clients.remove(conn)
    }

    override fun onMessage(conn: WebSocket, message: String) {
        // Mensagens do cliente não são usadas
    }

    override fun onError(conn: WebSocket?, ex: Exception) {
        ex.printStackTrace()
    }

    override fun onStart() {
        connectionLostTimeout = 0
    }

    /** Envia um frame JPEG (como bytes) para todos os clientes conectados. */
    fun broadcastFrame(jpegBytes: ByteArray) {
        if (clients.isEmpty()) return
        val snapshot = clients.toList()
        for (client in snapshot) {
            try {
                if (client.isOpen) client.send(jpegBytes)
            } catch (_: Exception) {
                // cliente desconectou
            }
        }
    }

    val hasClients: Boolean get() = clients.isNotEmpty()
}
