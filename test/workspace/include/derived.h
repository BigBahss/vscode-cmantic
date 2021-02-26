#include "base.h"
#include <string>
#include <iostream>


class Derived : public Base
{
public:
    explicit Derived()
        : Base(),
          m_description("empty"),
          m_data(42)
    {
        std::cout << "Constructed Derived()\n";
    }

    explicit Derived(const std::string &name, const std::string &description = std::string());

    ~Derived();

    int fooBar(const std::string &foo,
               int bar = 47,
               const std::string &baz = R"(const std::string &baz = "default")");

    constexpr int foo() const;

private:
    std::string m_description;
    const int m_data;
};
