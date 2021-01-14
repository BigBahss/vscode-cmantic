#ifndef DERIVED_H
#define DERIVED_H

#include "base.h"


class Derived : public Base
{
public:
    explicit Derived(const std::string &name, const std::string &description = std::string());
    ~Derived();

    std::string description() const noexcept;
    void setDescription(const std::string &description);

private:
    std::string m_description;

};

#endif // DERIVED_H
