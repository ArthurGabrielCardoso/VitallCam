package com.vitallcam

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Segura a conexão da Niimbot viva mesmo com o app em segundo plano.
 *
 * Sem isto a conexão BLE vive dentro da Activity: o Android mata o processo
 * quando ele sai de vista para economizar memória, a conexão cai junto, e
 * reabrir o app é sempre uma conexão nova — que é exatamente quando a
 * impressora desperdiça etiqueta se recalibrando no rolo. Um serviço em
 * primeiro plano é tratado como prioridade alta pelo sistema; enquanto ele
 * estiver de pé, o processo (e a conexão que mora nele, guardada pelo
 * singleton de `EtiquetaNiimbot`) sobrevive ao app sair de tela.
 *
 * Fica de pé enquanto a impressora estiver escolhida. Só some quando a
 * pessoa desconecta de propósito (ver `esquecer()` em EtiquetaNiimbot).
 */
class ImpressoraServico : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        iniciarEmPrimeiroPlano()
        return START_STICKY
    }

    override fun onCreate() {
        super.onCreate()
        iniciarEmPrimeiroPlano()
    }

    private fun iniciarEmPrimeiroPlano() {
        val notificacao = montarNotificacao()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(ID_NOTIFICACAO, notificacao, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } else {
            startForeground(ID_NOTIFICACAO, notificacao)
        }
    }

    private fun montarNotificacao(): Notification {
        val gerenciador = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val canalExistente = gerenciador.getNotificationChannel(CANAL)
            if (canalExistente == null) {
                gerenciador.createNotificationChannel(
                    NotificationChannel(CANAL, "Impressora de etiquetas", NotificationManager.IMPORTANCE_MIN)
                        .apply { description = "Mantém a Niimbot conectada com o app em segundo plano." },
                )
            }
        }

        val abrirApp = packageManager.getLaunchIntentForPackage(packageName)
        val toque = abrirApp?.let {
            PendingIntent.getActivity(
                this, 0, it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        return android.app.Notification.Builder(this, CANAL)
            .setContentTitle("Impressora de etiquetas conectada")
            .setContentText("A Niimbot fica pronta para a próxima etiqueta, mesmo com o app fechado.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(toque)
            .build()
    }

    companion object {
        private const val CANAL = "vitallcam.impressora"
        private const val ID_NOTIFICACAO = 4501

        /** Chama depois de conectar de verdade — idempotente, chamar de novo não custa nada. */
        fun iniciar(context: Context) {
            runCatching {
                val intent = Intent(context, ImpressoraServico::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
                else context.startService(intent)
            }
        }

        /** A pessoa desconectou de propósito — não há mais o que segurar de pé. */
        fun encerrar(context: Context) {
            runCatching { context.stopService(Intent(context, ImpressoraServico::class.java)) }
        }
    }
}
