#include <iostream>
#include "application.h"


int main(int argc, char *argv[])
{
    std::cout << "Welcome to 'test_workspace', "
                 "an extremly useful application that should definitely be used.\n";

    std::cin.get();

    return application_event_loop();
}
