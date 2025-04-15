using Hangman.Controladores;
using Hangman.Controladores.Hangman.Modelos;

namespace Hangman
{
    internal class Program
    {

        static void CorrerJuego()
        {
            Console.Clear(); 
            Console.WriteLine(DibujoAhorcado.Dibujar(AhorcadoController.cantidadErrores)); 
            DibujoAhorcado.ImprimirEpacios([-1], null); 
            DibujoAhorcado.Ingresar(); 
        }

        static void Menu()
        {
            Console.Clear();
            Console.Write("Entre una opcion: ");

            Console.WriteLine("\n\n1 - Empezar juego");
            Console.WriteLine("2 - Agregar palabra");
            Console.WriteLine("3 - Salir");


            int opcion;
            if (!int.TryParse(Console.ReadLine(), out opcion))
            {
                Console.WriteLine("\nIngrese un numero valido por favor");
                Console.WriteLine("Toque cualquier tecla para continuar...");
                Console.ReadKey();
                Menu();
            }

            switch (opcion)
            {
                case 1:
                    {

                        PalabraController.palabra = PalabraController.Seleccionar();
                        CorrerJuego();
                        break;
                    }
                case 2:
                    {
                        PalabraController.Agregar();
                        break;
                    }
                case 3: break;
                default: Menu(); break;

            }
        }
        
        static void Main(string[] args)
        {

            Menu();
        }


    }
}

