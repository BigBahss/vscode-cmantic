#ifndef DERIVED_H
#define DERIVED_H

#include "base.h"
#include <string>


class Derived : public Base
{
public:
    explicit Derived();
    explicit Derived(const std::string &name, const std::string &description = std::string());
    ~Derived();

    int fooBar(const std::string &foo,
               int bar = 47,
               const std::string &baz = R"(const std::string &baz = "default")");

    inline std::string foo() const;

private:
    std::string m_description;
};

#endif // DERIVED_H
