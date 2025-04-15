using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Hangman.Modelos;

namespace Hangman.Controladores
{
    internal class AhorcadoController
    {
        public static string[] Espacios = Enumerable.Repeat("_", PalabraController.palabra.Length).ToArray();

        public static int cantidadErrores = 0; // Hacer la variable pública para acceder desde DibujoAhorcado
    }

    namespace Hangman.Modelos
    {
        public static class DibujoAhorcado
        {
            public static object?[] Espacios { get; private set; }

            public static string Dibujar(int cantidadErrores)
            {
                string[] dibujo = {
                    "  _______   ",
                    " |/    |    ",
                    " |           ",
                    " |           ",
                    " |           ",
                    " |           ",
                    "_|___        "
                };

                switch (cantidadErrores)
                {
                    case 1:
                        dibujo[2] = " |     o     "; // Cabeza
                        break;
                    case 2:
                        dibujo[2] = " |     o     "; // Cabeza
                        dibujo[3] = " |     |     "; // Torso
                        break;
                    case 3:
                        dibujo[2] = " |     o     "; // Cabeza
                        dibujo[3] = " |    /|     "; // Torso y brazo izquierdo
                        break;
                    case 4:
                        dibujo[2] = " |     o     "; // Cabeza
                        dibujo[3] = " |    /|\\   "; // Torso y ambos brazos
                        break;
                    case 5:
                        dibujo[2] = " |     o     "; // Cabeza
                        dibujo[3] = " |    /|\\   "; // Torso y ambos brazos
                        dibujo[4] = " |    /      "; // Pierna izquierda
                        break;
                    case 6:
                        dibujo[2] = " |     o     "; // Cabeza
                        dibujo[3] = " |    /|\\   "; // Torso y ambos brazos
                        dibujo[4] = " |    / \\   "; // Ambas piernas
                        break;
                }

                return string.Join("\n", dibujo);
            }

            public static void ImprimirEpacios(int[] indices, string? letra)
            {
                if (Espacios == null)
                {
                    Espacios = AhorcadoController.Espacios.Clone() as object?[]; // Inicializar Espacios si es null
                }
                foreach (int indice in indices)
                {
                    if (indice != -1 && letra != null) Espacios[indice] = letra;
                }

                foreach (string e in Espacios)
                {
                    Console.Write(e);
                }
                Console.WriteLine(); 
            }

            public static void Ingresar()
            {
                Console.Write("\n\nIngresa letra: ");
                string nuevaLetra = Console.ReadLine();
                int[] indices = PalabraController.Verificar(nuevaLetra);

                if (indices.Length == 0) // La letra no está en la palabra
                {
                    AhorcadoController.cantidadErrores++;
                }

                ImprimirEpacios(indices, nuevaLetra);
                Console.WriteLine(Dibujar(AhorcadoController.cantidadErrores)); // Imprimir el dibujo aquí

                string fullString = string.Join("", Espacios);
                if (fullString == PalabraController.palabra)
                {
                    Console.WriteLine("¡Felicidades, has adivinado la palabra!");
                }
                else if (AhorcadoController.cantidadErrores < 6) // Continuar si no se ha perdido
                {
                    Ingresar();
                }
                else
                {
                    Console.WriteLine("¡Has perdido! La palabra era: " + PalabraController.palabra);
                }
            }
        }
    }
}