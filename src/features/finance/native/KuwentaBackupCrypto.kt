package kuwenta.backup

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/** Uses Android's crypto provider instead of a JavaScript hashing loop. */
class KuwentaBackupCrypto : Module() {
  override fun definition() = ModuleDefinition {
    Name("KuwentaBackupCrypto")
    AsyncFunction("deriveKey") { password: String, saltHex: String, iterations: Int ->
      require(iterations == 600_000) { "Unsupported backup encryption settings." }
      require(saltHex.matches(Regex("[a-f0-9]{32}"))) { "Invalid backup salt." }
      val salt = ByteArray(16) { index -> saltHex.substring(index * 2, index * 2 + 2).toInt(16).toByte() }
      val characters = password.toCharArray()
      val specification = PBEKeySpec(characters, salt, iterations, 256)
      var key: ByteArray? = null
      try {
        val derived = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(specification).encoded
        key = derived
        derived.joinToString("") { byte -> (byte.toInt() and 255).toString(16).padStart(2, '0') }
      } finally {
        specification.clearPassword()
        characters.fill('\u0000')
        key?.fill(0)
      }
    }
  }
}
