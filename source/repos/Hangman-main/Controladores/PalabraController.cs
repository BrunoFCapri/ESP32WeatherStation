using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading.Tasks;
using Microsoft.VisualBasic;

namespace Hangman.Controladores
{
    internal class PalabraController
    {
        
        public static string[] Palabras = { "manzana", "casa", "arbol", "colegio" };
        public static string palabra = "";

        public static void Agregar()
        {
            Console.Clear();
            Console.WriteLine("Ingrese la palabra que quiere agregar");
            string palabra=Console.ReadLine();
            Palabras = Palabras.Append(palabra).ToArray();
        }

        public static string Seleccionar()
        {
            string palabraSeleccionada = "";
            Random random = new Random();
            palabraSeleccionada = Palabras[random.Next(Palabras.Length)];
            Console.WriteLine(palabraSeleccionada);
            return palabraSeleccionada;
        }




        public static int[] Verificar(string letraIngresada)
        {
            int[] values = {};
            for (int i = 0; i < palabra.Length; i++)
            {
                if (letraIngresada == palabra[i].ToString())
                {
                    values = values.Append(i).ToArray();
                }
            }
            return values;
        }















    }
}
