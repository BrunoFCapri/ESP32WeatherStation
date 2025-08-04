-- Main.elm
module Main exposing (main)

import Browser
import Html exposing (text)

main =
    Browser.sandbox { init = (), update = \_ m -> m, view = \_ -> text "¡Hola desde Elm!" }