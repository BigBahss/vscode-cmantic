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

    std::string description() const noexcept;
    void setDescription(const std::string &description);

    int fooBar(const double &foo,
               int bar = 47,
               double *baz = nullptr);

    inline std::string foo() const;

private:
    std::string m_description;
};

#endif // DERIVED_H
